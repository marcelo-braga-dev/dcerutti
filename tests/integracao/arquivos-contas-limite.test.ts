/** Fotos no servidor, exclusão de produto, contas e senhas, erros previsíveis, limite de tentativas e avisos por e-mail. */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from 'better-auth/crypto';
import { Readable } from 'node:stream';
import { ArquivoInvalido, caminhoDoArquivo, DIR_ARQUIVOS, lerFaixa, salvarFotoProduto, salvarVideoProduto } from '@/server/arquivos';
import { excluirProdutoDefinitivo, removerArquivosSemUso } from '@/server/exclusao';
import { criarConta, trocarSenha } from '@/server/contas';
import { ErroNegocio, gravar, mensagemDoBanco } from '@/server/erros';
import { bloqueio, ipDoCliente, limpar, LOGIN_POR_EMAIL, registrarFalha } from '@/server/limite';
import { avisarEquipe } from '@/server/avisos';
import { criarPedido } from '@/server/pedidos';
import { clientePorNome, db, estado, produtoDeTeste } from './suporte/ajuda';

const imagem = (w = 2000, h = 1000, formato: 'jpeg' | 'png' = 'jpeg') =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } } })[formato]().toBuffer();

describe('fotos no servidor (D-13)', () => {
  it('caminho seguro: nunca sai da pasta de arquivos', () => {
    expect(caminhoDoArquivo(['produtos', 'A', 'x.webp'])).toBe(path.join(DIR_ARQUIVOS, 'produtos', 'A', 'x.webp'));
    for (const ruim of [[], ['..', 'etc', 'passwd'], ['produtos', '..', '..', 'x'], ['a', ''], ['.'], ['a\0b']]) expect(caminhoDoArquivo(ruim)).toBeNull();
  });

  it('converte para WebP, reduz para 1600 px e grava na pasta da referência', async () => {
    const url = await salvarFotoProduto('ref-1', await imagem(3200, 1600));
    expect(url).toMatch(/^\/arquivos\/produtos\/REF-1\/[\w-]+\.webp$/);
    const arquivo = caminhoDoArquivo(url.replace('/arquivos/', '').split('/'))!;
    const meta = await sharp(arquivo).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1600, 800]);
  });

  it('recusa o que não é imagem, formato não aceito, arquivo grande e referência inválida', async () => {
    await expect(salvarFotoProduto('REF', Buffer.from('não sou imagem'))).rejects.toBeInstanceOf(ArquivoInvalido);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(salvarFotoProduto('REF', svg)).rejects.toThrow(/Use JPG, PNG/);
    await expect(salvarFotoProduto('REF', Buffer.alloc(9 * 1024 * 1024))).rejects.toThrow(/8 MB/);
    await expect(salvarFotoProduto('../x', await imagem(10, 10))).rejects.toThrow('Referência inválida.');
    await expect(salvarFotoProduto('REF', await imagem(10, 10, 'png'))).resolves.toMatch(/\.webp$/);
  });
});

/** MP4 mínimo: caixas ftyp, mdat e moov (no fim, como sai de muitos celulares) com o codec dentro. */
const caixa = (tipo: string, conteudo: Buffer) => {
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(8 + conteudo.length);
  cab.write(tipo, 4, 'latin1');
  return Buffer.concat([cab, conteudo]);
};
const mp4 = (codec = 'avc1', marca = 'isom') =>
  Buffer.concat([caixa('ftyp', Buffer.from(`${marca}\0\0\0\0isomavc1`, 'latin1')), caixa('mdat', Buffer.alloc(4096, 7)), caixa('moov', Buffer.from(`trakmdiastblstsd${codec}`, 'latin1'))]);
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from('webm', 'latin1'), Buffer.alloc(2000, 1)]);
const corpo = (b: Buffer) => Readable.from([b.subarray(0, 100), b.subarray(100)]);

describe('vídeos no servidor (D-29)', () => {
  it('grava MP4, MOV (como .mp4) e WebM na pasta da referência, inteiros', async () => {
    const url = await salvarVideoProduto('vid-1', corpo(mp4()));
    expect(url).toMatch(/^\/arquivos\/produtos\/VID-1\/[\w-]+\.mp4$/);
    expect(await readFile(caminhoDoArquivo(url.replace('/arquivos/', '').split('/'))!)).toEqual(mp4());
    await expect(salvarVideoProduto('VID-1', corpo(mp4('avc1', 'qt  ')))).resolves.toMatch(/\.mp4$/);
    await expect(salvarVideoProduto('VID-1', corpo(webm()))).resolves.toMatch(/\.webm$/);
    await expect(salvarVideoProduto('VID-1', new Blob([mp4('av01')]).stream())).resolves.toMatch(/\.mp4$/);
  });

  it('recusa HEVC, codec desconhecido, o que não é vídeo, vazio, grande demais e referência inválida, sem deixar arquivo', async () => {
    await expect(salvarVideoProduto('VID-2', corpo(mp4('hvc1')))).rejects.toThrow(/HEVC/);
    await expect(salvarVideoProduto('VID-2', corpo(mp4('xxxx')))).rejects.toThrow(/Codec/);
    await expect(salvarVideoProduto('VID-2', corpo(Buffer.from('não sou vídeo, só texto qualquer aqui')))).rejects.toBeInstanceOf(ArquivoInvalido);
    await expect(salvarVideoProduto('VID-2', corpo(mp4().subarray(0, 4136)))).rejects.toThrow(/incompleto/);
    await expect(salvarVideoProduto('VID-2', Readable.from([]))).rejects.toThrow(/Escolha/);
    const grande = Readable.from((function* () { for (let i = 0; i < 101; i++) yield Buffer.alloc(1024 * 1024); })());
    await expect(salvarVideoProduto('VID-2', grande)).rejects.toThrow(/100 MB/);
    await expect(salvarVideoProduto('../x', corpo(mp4()))).rejects.toThrow('Referência inválida.');
    expect(await readdir(path.join(DIR_ARQUIVOS, 'produtos', 'VID-2'))).toEqual([]);
  });

  it('faixas de bytes (Range) para o navegador tocar e avançar o vídeo', () => {
    expect(lerFaixa(null, 1000)).toBeNull();
    expect(lerFaixa('bytes=0-', 1000)).toEqual([0, 999]);
    expect(lerFaixa('bytes=0-1', 1000)).toEqual([0, 1]);
    expect(lerFaixa('bytes=500-5000', 1000)).toEqual([500, 999]);
    expect(lerFaixa('bytes=-100', 1000)).toEqual([900, 999]);
    expect(lerFaixa('bytes=1000-', 1000)).toBe('invalida');
    expect(lerFaixa('bytes=9-3', 1000)).toBe('invalida');
    expect(lerFaixa('bytes=0-1,5-9', 1000)).toBeNull();
    expect(lerFaixa('items=0-1', 1000)).toBeNull();
  });
});

describe('exclusão de produto', () => {
  it('apaga produto, tamanhos, fotos (linhas e arquivos), custo e histórico', async () => {
    const url = await salvarFotoProduto('EXCL', await imagem(100, 100));
    const { produto, v } = await produtoDeTeste({ imagens: [url, 'https://exemplo.com/x.jpg'] });
    await db.movimentoEstoque.create({ data: { varianteId: v.P, delta: 5, motivo: 'entrada' } });
    const arquivo = caminhoDoArquivo(url.replace('/arquivos/', '').split('/'))!;
    expect(existsSync(arquivo)).toBe(true);
    const r = await excluirProdutoDefinitivo(db, produto.id);
    expect(r).toEqual({ ok: true, referencia: produto.referencia, arquivos: 1 });
    expect(existsSync(arquivo)).toBe(false);
    expect(await db.produto.findUnique({ where: { id: produto.id } })).toBeNull();
    expect(await db.variante.count({ where: { produtoId: produto.id } })).toBe(0);
    expect(await db.produtoImagem.count({ where: { produtoId: produto.id } })).toBe(0);
    expect(await db.custo.count({ where: { produtoId: produto.id } })).toBe(0);
    expect(await db.movimentoEstoque.count({ where: { varianteId: v.P } })).toBe(0);
  });

  it('apaga também os vídeos e as capas (linhas e arquivos)', async () => {
    const video = await salvarVideoProduto('EXCLV', corpo(mp4()));
    const capa = await salvarFotoProduto('EXCLV', await imagem(100, 100));
    const { produto } = await produtoDeTeste();
    await db.produtoVideo.create({ data: { produtoId: produto.id, url: video, capa } });
    const arquivos = [video, capa].map(u => caminhoDoArquivo(u.replace('/arquivos/', '').split('/'))!);
    expect(await excluirProdutoDefinitivo(db, produto.id)).toEqual({ ok: true, referencia: produto.referencia, arquivos: 2 });
    expect(arquivos.map(a => existsSync(a))).toEqual([false, false]);
    expect(await db.produtoVideo.count({ where: { produtoId: produto.id } })).toBe(0);
  });

  it('recusa produto que já entrou em pedido', async () => {
    const { produto, v } = await produtoDeTeste();
    const c = await clientePorNome('Roberto Lima');
    await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    const r = await excluirProdutoDefinitivo(db, produto.id);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/1 item\(ns\) de pedido/);
    expect(await db.produto.findUnique({ where: { id: produto.id } })).not.toBeNull();
    expect(await excluirProdutoDefinitivo(db, 999_999_999)).toEqual({ ok: false, erro: 'Produto não encontrado.' });
  });

  it('arquivo usado por outro produto ou por um pedido não é apagado; externo é ignorado', async () => {
    const url = await salvarFotoProduto('COMP', await imagem(50, 50));
    await produtoDeTeste({ imagens: [url] });
    const arquivo = caminhoDoArquivo(url.replace('/arquivos/', '').split('/'))!;
    expect(await removerArquivosSemUso(db, [url, 'https://exemplo.com/a.jpg'])).toBe(0);
    expect(existsSync(arquivo)).toBe(true);
    const solto = path.join(DIR_ARQUIVOS, 'produtos', 'SOLTO', 'x.webp');
    await mkdir(path.dirname(solto), { recursive: true });
    await writeFile(solto, 'x');
    expect(await removerArquivosSemUso(db, ['/arquivos/produtos/SOLTO/x.webp', '/arquivos/produtos/SOLTO/x.webp'])).toBe(1);
    expect(existsSync(path.dirname(solto)), 'pasta vazia é removida').toBe(false);
    expect(await removerArquivosSemUso(db, ['/arquivos/../../etc/passwd'])).toBe(0);
  });
});

describe('contas e senhas', () => {
  it('criarConta grava e-mail em minúsculas e a senha com hash verificável', async () => {
    const u = await criarConta(db, { nome: 'Teste Conta', email: `  Conta.${Date.now()}@Exemplo.COM `, senha: 'senha-forte-1', papel: 'cliente' });
    expect(u.email).toBe(u.email.trim().toLowerCase());
    const conta = await db.account.findFirstOrThrow({ where: { userId: u.id } });
    expect(conta.providerId).toBe('credential');
    expect(conta.password).not.toBe('senha-forte-1');
    expect(await verifyPassword({ hash: conta.password!, password: 'senha-forte-1' })).toBe(true);
    expect(await verifyPassword({ hash: conta.password!, password: 'outra' })).toBe(false);
  });

  it('trocarSenha troca o hash e encerra todas as sessões', async () => {
    const u = await criarConta(db, { nome: 'Teste Sessão', email: `sessao.${Date.now()}@exemplo.com`, senha: 'senha-antiga-1', papel: 'cliente' });
    await db.session.createMany({ data: [1, 2].map(i => ({ userId: u.id, token: `tok-${u.id}-${i}`, expiresAt: new Date(Date.now() + 864e5) })) });
    await trocarSenha(db, u.id, 'senha-nova-123');
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    const conta = await db.account.findFirstOrThrow({ where: { userId: u.id } });
    expect(await verifyPassword({ hash: conta.password!, password: 'senha-nova-123' })).toBe(true);
  });
});

describe('erros previsíveis', () => {
  it('ErroNegocio e erros conhecidos do banco viram mensagem; o resto sobe', async () => {
    expect(await gravar(async () => 7)).toEqual({ ok: true, valor: 7 });
    expect(await gravar(async () => { throw new ErroNegocio('Regra quebrada.'); })).toEqual({ ok: false, erro: 'Regra quebrada.' });
    const dup = await gravar(() => db.marca.create({ data: { nome: 'x', slug: 'hering' } }));
    expect(dup).toEqual({ ok: false, erro: expect.stringMatching(/Já existe um cadastro/) });
    const sumiu = await gravar(() => db.marca.update({ where: { id: 999_999 }, data: { nome: 'x' } }));
    expect(sumiu).toEqual({ ok: false, erro: expect.stringMatching(/não encontrado/) });
    await expect(gravar(async () => { throw new TypeError('bug'); })).rejects.toThrow('bug');
    expect(mensagemDoBanco(new Error('x'))).toBeNull();
  });
});

describe('limite de tentativas', () => {
  const regra = { max: 3, janelaMs: 60_000 };
  it('bloqueia na N-ésima falha dentro da janela e libera quando a mais antiga expira', () => {
    const k = `teste:${Math.random()}`;
    const t0 = 1_000_000;
    expect(bloqueio(k, regra, t0)).toBe(0);
    registrarFalha(k, regra, t0);
    registrarFalha(k, regra, t0 + 1000);
    expect(bloqueio(k, regra, t0 + 2000)).toBe(0);
    registrarFalha(k, regra, t0 + 2000);
    expect(bloqueio(k, regra, t0 + 3000)).toBe(1);
    expect(bloqueio(k, regra, t0 + 60_001)).toBe(0);
  });
  it('minutos arredondados para cima e limpar zera', () => {
    const k = `teste:${Math.random()}`;
    for (let i = 0; i < 5; i++) registrarFalha(k, LOGIN_POR_EMAIL, 0);
    expect(bloqueio(k, LOGIN_POR_EMAIL, 60_000)).toBe(14);
    limpar(k);
    expect(bloqueio(k, LOGIN_POR_EMAIL, 60_000)).toBe(0);
  });
  it('IP do cliente vem do X-Real-IP', async () => {
    estado.ip = '203.0.113.9';
    expect(await ipDoCliente()).toBe('203.0.113.9');
    estado.ip = '10.0.0.1';
  });
});

describe('avisos por e-mail (L-13)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pedido novo avisa o vendedor do cliente, com link do painel', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { v } = await produtoDeTeste();
    const c = await clientePorNome('Juliana Ferreira');
    const p = await criarPedido({ tipo: 'condicional', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 2 }] });
    await avisarEquipe(p.id, 'novo', 'https://loja.teste');
    expect(log).toHaveBeenCalledTimes(1);
    const texto = String(log.mock.calls[0][0]);
    expect(texto).toContain('Para: ana@dcerutti.local');
    expect(texto).toContain(`Condicional novo ${p.codigo} · Juliana Ferreira`);
    expect(texto).toContain('2 peças');
    expect(texto).toContain(`https://loja.teste/painel/pedidos/${p.id}`);
  });

  it('vendedor inativo: avisa todos os gestores ativos', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { v } = await produtoDeTeste();
    const c = await clientePorNome('Juliana Ferreira');
    const fabio = await db.user.findUniqueOrThrow({ where: { email: 'fabio@dcerutti.local' } });
    const p = await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: fabio.id, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    await avisarEquipe(p.id, 'cancelado', 'https://loja.teste');
    const para = log.mock.calls.map(x => String(x[0]).match(/Para: (\S+)/)![1]).sort();
    expect(para).toEqual(['gestor@dcerutti.local', 'supervisora@dcerutti.local']);
    expect(String(log.mock.calls[0][0])).toContain('cancelado pela cliente');
  });

  it('pedido inexistente: não envia nada', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await avisarEquipe('nao-existe', 'novo', 'x');
    expect(log).not.toHaveBeenCalled();
  });
});
