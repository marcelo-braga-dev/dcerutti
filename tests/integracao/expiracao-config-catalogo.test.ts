/** Expiração de pendentes (Q-05), configurações (validação e padrão) e o catálogo em memória. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expirarPendentes, expirarSeNecessario } from '@/server/expiracao';
import { CONFIG_PADRAO, lerConfig, salvarConfig } from '@/server/config';
import { catalogo, invalidarCatalogo, produtoPorReferencia } from '@/server/catalogo';
import { criarPedido } from '@/server/pedidos';
import { clientePorNome, db, produtoDeTeste, variante } from './suporte/ajuda';

const DIA = 864e5;
async function pendente(tipo: 'compra' | 'condicional', diasAtras: number, varianteId: number) {
  const c = await clientePorNome('Roberto Lima');
  const p = await criarPedido({ tipo, origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId, quantidade: 1 }] });
  await db.pedido.update({ where: { id: p.id }, data: { criadoEm: new Date(Date.now() - diasAtras * DIA) } });
  return p.id;
}

describe('expiração de pendentes (Q-05)', () => {
  afterEach(() => salvarConfig({ diasExpiracao: 7 }));

  it('cancela como "expirado" só os pendentes mais velhos que o prazo e devolve a reserva', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const velho = await pendente('condicional', 8, v.M);
    const novo = await pendente('condicional', 6, v.M);
    const compraVelha = await pendente('compra', 30, v.M);
    expect((await variante(v.M)).reservado).toBe(2);
    expect(await expirarPendentes()).toBeGreaterThanOrEqual(2);
    const st = async (id: string) => db.pedido.findUniqueOrThrow({ where: { id }, select: { status: true, motivoCancelamento: true } });
    expect(await st(velho)).toEqual({ status: 'cancelado', motivoCancelamento: 'expirado' });
    expect(await st(compraVelha)).toEqual({ status: 'cancelado', motivoCancelamento: 'expirado' });
    expect(await st(novo)).toEqual({ status: 'pendente', motivoCancelamento: null });
    expect((await variante(v.M)).reservado).toBe(1);
  });

  it('prazo 0 = nunca expira', async () => {
    await salvarConfig({ diasExpiracao: 0 });
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const id = await pendente('compra', 400, v.M);
    expect(await expirarPendentes()).toBe(0);
    expect((await db.pedido.findUniqueOrThrow({ where: { id } })).status).toBe('pendente');
  });

  it('o prazo vem das configurações', async () => {
    await salvarConfig({ diasExpiracao: 2 });
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const id = await pendente('compra', 3, v.M);
    await expirarPendentes();
    expect((await db.pedido.findUniqueOrThrow({ where: { id } })).motivoCancelamento).toBe('expirado');
  });

  it('roda no máximo uma vez por hora por processo', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    (globalThis as { __expiracaoEm?: number }).__expiracaoEm = undefined;
    await expirarSeNecessario();
    const id = await pendente('compra', 20, v.M);
    await expirarSeNecessario(); // menos de 1 hora depois: não roda
    expect((await db.pedido.findUniqueOrThrow({ where: { id } })).status).toBe('pendente');
    (globalThis as { __expiracaoEm?: number }).__expiracaoEm = Date.now() - 61 * 60_000;
    await expirarSeNecessario();
    expect((await db.pedido.findUniqueOrThrow({ where: { id } })).status).toBe('cancelado');
  });
});

describe('configurações', () => {
  afterEach(async () => {
    await salvarConfig({ parcelas: 0, frete: null, diasExpiracao: 7, whatsappLoja: '49988036499' });
    vi.restoreAllMocks();
  });

  it('gravar e ler de volta (inclusive frete nulo e objeto)', async () => {
    await salvarConfig({ parcelas: 6, frete: { valor: 19.9, gratisAcima: 250 } });
    expect(await lerConfig()).toMatchObject({ parcelas: 6, frete: { valor: 19.9, gratisAcima: 250 } });
    await salvarConfig({ frete: null });
    expect((await lerConfig()).frete).toBeNull();
  });

  it('valor gravado fora do formato é ignorado (vale o padrão) e avisa no log', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.configuracao.update({ where: { chave: 'whatsappLoja' }, data: { valor: 'abc' } });
    await db.configuracao.update({ where: { chave: 'parcelas' }, data: { valor: 99 } });
    const cfg = await lerConfig();
    expect(cfg.whatsappLoja).toBe(CONFIG_PADRAO.whatsappLoja);
    expect(cfg.parcelas).toBe(CONFIG_PADRAO.parcelas);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('whatsappLoja'));
  });

  it('chave desconhecida no banco é ignorada sem quebrar', async () => {
    await db.configuracao.upsert({ where: { chave: 'chaveAntiga' }, create: { chave: 'chaveAntiga', valor: 1 }, update: {} });
    await expect(lerConfig()).resolves.toMatchObject({ diasExpiracao: 7 });
    await db.configuracao.delete({ where: { chave: 'chaveAntiga' } });
  });
});

describe('catálogo em memória', () => {
  it('só produtos ativos, sem custo, com disponível = estoque − reservado', async () => {
    const lista = await catalogo();
    const ativos = await db.produto.count({ where: { ativo: true } });
    expect(lista).toHaveLength(ativos);
    expect(lista.some(p => p.referencia === 'FIX-INATIVO')).toBe(false);
    for (const p of lista) expect(Object.keys(p)).not.toContain('custo');
    const variantes = await db.variante.findMany({ where: { produto: { ativo: true } }, select: { id: true, estoque: true, reservado: true } });
    const porId = new Map(lista.flatMap(p => p.variantes).map(v => [v.id, v.disponivel]));
    for (const v of variantes) expect(porId.get(v.id), `variante ${v.id}`).toBe(Math.max(0, v.estoque - v.reservado));
  });

  it('tamanhos na ordem certa (letras e números)', async () => {
    const calca = (await catalogo()).find(p => p.categoriaSlug === 'calcas')!;
    expect(calca.variantes.map(v => v.tamanho)).toEqual(['36', '38', '40', '42', '44', '46']);
    const moletom = (await catalogo()).find(p => p.categoriaSlug === 'moletons' && p.variantes.length === 5)!;
    expect(moletom.variantes.map(v => v.tamanho)).toEqual(['P', 'M', 'G', 'XG', 'GG']);
  });

  it('fotos na ordem; destaques como lista', async () => {
    const p = await produtoPorReferencia('FIX-ESTOQUE');
    const imgs = await db.produtoImagem.findMany({ where: { produto: { referencia: 'FIX-ESTOQUE' } }, orderBy: { ordem: 'asc' } });
    expect(p!.imagens).toEqual(imgs.map(i => i.url));
    expect(Array.isArray(p!.destaques)).toBe(true);
  });

  it('busca por referência ignora maiúsculas; inexistente ou inativo = null', async () => {
    expect((await produtoPorReferencia('fix-promo'))?.referencia).toBe('FIX-PROMO');
    expect(await produtoPorReferencia('NAO-EXISTE')).toBeNull();
    expect(await produtoPorReferencia('FIX-INATIVO')).toBeNull();
  });

  it('cache: mudança direta no banco só aparece depois de invalidar', async () => {
    const { produto, ref } = await produtoDeTeste();
    await catalogo();
    await db.produto.update({ where: { id: produto.id }, data: { nome: 'Nome Novo do Teste' } });
    expect((await produtoPorReferencia(ref))!.nome).not.toBe('Nome Novo do Teste');
    invalidarCatalogo();
    expect((await produtoPorReferencia(ref))!.nome).toBe('Nome Novo do Teste');
  });
});
