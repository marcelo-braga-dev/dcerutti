/** Server Actions de produtos (gestor): cadastro, edição, fotos, vídeos, tamanhos, estoque e exclusão. */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DIR_ARQUIVOS } from '@/server/arquivos';
import { adicionarVariante, ajustarEstoque, excluirProduto, removerVariante, salvarProduto } from '@/server/acoes/produtos';
import { produtoPorReferencia } from '@/server/catalogo';
import { criarPedido } from '@/server/pedidos';
import { clientePorNome, db, entrarComo, esperarErroDeCampo, form, produtoDeTeste, redirecionou, variante } from './suporte/ajuda';

const vazio = {};
let n = 0;
const ref = () => `NOVO${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`;
async function campos(o: Record<string, string | boolean | number | undefined> = {}) {
  const marca = await db.marca.findFirstOrThrow({ where: { slug: 'hering' } });
  const cat = await db.categoria.findFirstOrThrow({ where: { slug: 'camisetas' } });
  return { referencia: ref(), nome: 'Camiseta Nova Teste', marcaId: marca.id, categoriaId: String(cat.id), genero: 'feminino', preco: '89,90', ativo: true, ...o };
}

beforeEach(() => entrarComo('gestor@dcerutti.local'));

describe('salvar produto', () => {
  it('só o gestor', async () => {
    await entrarComo('ana@dcerutti.local');
    expect(await redirecionou(salvarProduto(vazio, form(await campos())))).toBe('/painel');
    expect(await redirecionou(excluirProduto(1))).toBe('/painel');
    expect(await redirecionou(ajustarEstoque(vazio, form({})))).toBe('/painel');
  });

  it('cria com referência em maiúsculas, preço cheio padrão, custo, destaques e fotos na ordem; aparece no catálogo', async () => {
    const c = await campos({ referencia: `abc${Date.now().toString(36).slice(-6)}`, precoCheio: '', custo: '35,50', destaques: 'Macia\n\n Leve ', imagens: '/arquivos/produtos/SEED/foto-02.webp\nhttps://exemplo.com/b.jpg', estacao: 'verao', imperdivel: true });
    const destino = await redirecionou(salvarProduto(vazio, form(c)));
    const p = await db.produto.findUniqueOrThrow({ where: { referencia: String(c.referencia).toUpperCase() }, include: { imagens: { orderBy: { ordem: 'asc' } }, custo: true } });
    expect(destino).toBe(`/painel/produtos/${p.id}`);
    expect(p).toMatchObject({ nome: 'Camiseta Nova Teste', genero: 'feminino', estacao: 'verao', imperdivel: true, ativo: true });
    expect([Number(p.preco), Number(p.precoCheio), Number(p.custo!.valor)]).toEqual([89.9, 89.9, 35.5]);
    expect(p.destaques).toEqual(['Macia', 'Leve']);
    expect(p.imagens.map(i => i.url)).toEqual(['/arquivos/produtos/SEED/foto-02.webp', 'https://exemplo.com/b.jpg']);
    expect((await produtoPorReferencia(p.referencia))?.nome, 'catálogo invalidado').toBe('Camiseta Nova Teste');
  });

  it('nova categoria criada pelo nome (sem duplicar pelo slug)', async () => {
    const sufixo = `${Date.now()}`;
    const nome = `Categoria Teste ${sufixo}`;
    await redirecionou(salvarProduto(vazio, form(await campos({ categoriaId: 'nova', novaCategoria: nome }))));
    await redirecionou(salvarProduto(vazio, form(await campos({ categoriaId: 'nova', novaCategoria: `  CATEGORIA teste ${sufixo}` }))));
    const cats = await db.categoria.findMany({ where: { slug: `categoria-teste-${sufixo}` }, include: { _count: { select: { produtos: true } } } });
    expect(cats.map(c => [c.nome, c._count.produtos])).toEqual([[nome, 2]]);
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ categoriaId: 'nova', novaCategoria: '' }))), 'novaCategoria');
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ categoriaId: '0' }))), 'categoriaId');
  });

  it('validações de preço, nome, marca, gênero, referência repetida e fotos', async () => {
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ preco: '0' }))), 'preco');
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ preco: '100', precoCheio: '90' }))), 'precoCheio', /maior ou igual/);
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ custo: 'abc' }))), 'custo');
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ nome: 'ab' }))), 'nome');
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ marcaId: '0' }))), 'marcaId');
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ genero: 'outro' }))), 'genero');
    esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ referencia: 'fix-promo' }))), 'referencia', /Já existe/);
    for (const ruim of ['http://exemplo.com/a.jpg', '/arquivos/../../etc/passwd', 'javascript:alert(1)', '/outra/pasta/a.jpg'])
      esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ imagens: ruim }))), 'imagens');
  });

  it('editar: troca fotos, remove o custo, desativa (some do catálogo) e mantém a referência única', async () => {
    const { produto, ref: r } = await produtoDeTeste({ imagens: ['/arquivos/produtos/SEED/foto-01.webp', '/arquivos/produtos/SEED/foto-03.webp'] });
    const c = await campos({ id: produto.id, referencia: r, imagens: '/arquivos/produtos/SEED/foto-03.webp', custo: '', ativo: false });
    expect(await salvarProduto(vazio, form(c))).toEqual({ ok: true, mensagem: 'Produto salvo.' });
    const p = await db.produto.findUniqueOrThrow({ where: { id: produto.id }, include: { imagens: true, custo: true } });
    expect(p.imagens.map(i => [i.url, i.ordem])).toEqual([['/arquivos/produtos/SEED/foto-03.webp', 0]]);
    expect(p.custo).toBeNull();
    expect(p.ativo).toBe(false);
    expect(await produtoPorReferencia(r)).toBeNull();
    esperarErroDeCampo(await salvarProduto(vazio, form({ ...c, referencia: 'FIX-PROMO' })), 'referencia');
  });
});

describe('vídeos do produto (D-29)', () => {
  it('grava os vídeos na ordem, com capa; aparecem no catálogo; os que saem têm o arquivo apagado', async () => {
    const pasta = path.join(DIR_ARQUIVOS, 'produtos', 'VIDTESTE');
    await mkdir(pasta, { recursive: true });
    const [a, b, capa] = ['a.mp4', 'b.webm', 'capa.webp'].map(n => `/arquivos/produtos/VIDTESTE/${n}`);
    for (const u of [a, b, capa]) await writeFile(path.join(DIR_ARQUIVOS, u.replace('/arquivos/', '')), 'x');
    const { produto, ref: r } = await produtoDeTeste();
    const c = await campos({ id: produto.id, referencia: r, videos: JSON.stringify([{ url: b, capa: null }, { url: a, capa }]) });
    expect(await salvarProduto(vazio, form(c))).toEqual({ ok: true, mensagem: 'Produto salvo.' });
    const vs = await db.produtoVideo.findMany({ where: { produtoId: produto.id }, orderBy: { ordem: 'asc' } });
    expect(vs.map(v => [v.url, v.capa, v.ordem])).toEqual([[b, null, 0], [a, capa, 1]]);
    expect((await produtoPorReferencia(r))?.videos).toEqual([{ url: b, capa: null }, { url: a, capa }]);

    expect(await salvarProduto(vazio, form({ ...c, videos: JSON.stringify([{ url: b, capa: null }]) }))).toMatchObject({ ok: true });
    expect(await db.produtoVideo.count({ where: { produtoId: produto.id } })).toBe(1);
    expect([a, b, capa].map(u => existsSync(path.join(DIR_ARQUIVOS, u.replace('/arquivos/', ''))))).toEqual([false, true, false]);
    expect(await salvarProduto(vazio, form({ ...c, videos: '' }))).toMatchObject({ ok: true });
    expect(await db.produtoVideo.count({ where: { produtoId: produto.id } })).toBe(0);
  });

  it('recusa vídeo externo, fora de /arquivos, com extensão de foto, JSON quebrado e mais de 5', async () => {
    const um = (url: string) => JSON.stringify([{ url, capa: null }]);
    const ruins = [um('https://exemplo.com/v.mp4'), um('/arquivos/../../etc/passwd.mp4'), um('/arquivos/produtos/X/a.webp'), '{quebrado', JSON.stringify(Array(6).fill({ url: '/arquivos/produtos/X/a.mp4', capa: null }))];
    for (const videos of ruins) esperarErroDeCampo(await salvarProduto(vazio, form(await campos({ videos }))), 'videos');
  });
});

describe('tamanhos e estoque', () => {
  it('adicionar tamanho registra o estoque inicial; recusa repetido e código interno já usado', async () => {
    const { produto } = await produtoDeTeste({ estoque: { P: 1 } });
    expect(await adicionarVariante(vazio, form({ produtoId: produto.id, tamanho: 'gg', estoque: 7, codigoInterno: `X${Date.now()}`.slice(0, 20), ean: '7891234567890' })))
      .toEqual({ ok: true, mensagem: 'Tamanho GG adicionado.' });
    const gg = await db.variante.findFirstOrThrow({ where: { produtoId: produto.id, tamanho: 'GG' } });
    expect(gg.estoque).toBe(7);
    expect(await db.movimentoEstoque.findFirst({ where: { varianteId: gg.id } })).toMatchObject({ delta: 7, observacao: 'Estoque inicial' });
    esperarErroDeCampo(await adicionarVariante(vazio, form({ produtoId: produto.id, tamanho: 'GG', estoque: 1 })), 'tamanho', /já existe/);
    esperarErroDeCampo(await adicionarVariante(vazio, form({ produtoId: produto.id, tamanho: 'XG', estoque: 1, codigoInterno: gg.codigoInterno! })), 'codigoInterno');
    esperarErroDeCampo(await adicionarVariante(vazio, form({ produtoId: produto.id, tamanho: 'XG', estoque: -1 })), 'estoque');
    esperarErroDeCampo(await adicionarVariante(vazio, form({ produtoId: produto.id, tamanho: 'XG', estoque: 1, ean: '12a' })), 'ean');
    esperarErroDeCampo(await adicionarVariante(vazio, form({ produtoId: produto.id, tamanho: '', estoque: 1 })), 'tamanho');
  });

  it('entrada e ajuste pelo formulário; entrada zero e ajuste abaixo da reserva recusados', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    expect(await ajustarEstoque(vazio, form({ varianteId: v.M, tipo: 'entrada', quantidade: 3, observacao: 'Nota 123' }))).toEqual({ ok: true, mensagem: 'Estoque atualizado.' });
    expect((await variante(v.M)).estoque).toBe(8);
    expect((await ajustarEstoque(vazio, form({ varianteId: v.M, tipo: 'ajuste', quantidade: 2 }))).ok).toBe(true);
    expect((await variante(v.M)).estoque).toBe(2);
    esperarErroDeCampo(await ajustarEstoque(vazio, form({ varianteId: v.M, tipo: 'entrada', quantidade: 0 })), 'quantidade');
    esperarErroDeCampo(await ajustarEstoque(vazio, form({ varianteId: v.M, tipo: 'ajuste', quantidade: 1.5 })), 'quantidade');
    esperarErroDeCampo(await ajustarEstoque(vazio, form({ varianteId: v.M, tipo: 'roubo', quantidade: 1 })), 'tipo');
    const c = await clientePorNome('Roberto Lima');
    await criarPedido({ tipo: 'condicional', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.M, quantidade: 2 }] });
    const r = await ajustarEstoque(vazio, form({ varianteId: v.M, tipo: 'ajuste', quantidade: 1 }));
    expect(r.erro).toMatch(/2 peças reservadas/);
    expect((await variante(v.M)).estoque).toBe(2);
  });

  it('remover tamanho: livre sai; com pedido ou reserva fica', async () => {
    const { v } = await produtoDeTeste({ estoque: { P: 1, M: 1 } });
    expect(await removerVariante(v.P)).toEqual({ ok: true });
    expect(await db.variante.findUnique({ where: { id: v.P } })).toBeNull();
    const c = await clientePorNome('Roberto Lima');
    await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.M, quantidade: 1 }] });
    expect((await removerVariante(v.M)).erro).toMatch(/tem pedidos ou reserva/);
    expect(await removerVariante(999_999_999)).toEqual({ ok: false, erro: 'Tamanho não encontrado.' });
  });

  it('excluir produto pela action: recusa id inválido e produto com pedido; exclui o livre', async () => {
    expect(await excluirProduto(1.5)).toEqual({ ok: false, erro: 'Produto não encontrado.' });
    const { produto } = await produtoDeTeste();
    expect(await excluirProduto(produto.id)).toEqual({ ok: true });
    const comPedido = await db.pedidoItem.findFirstOrThrow({ select: { produtoId: true } });
    expect((await excluirProduto(comPedido.produtoId)).erro).toMatch(/não pode ser excluído/);
  });
});
