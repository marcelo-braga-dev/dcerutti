/** Prazo vencido dos pendentes (Q-05, D-17), configurações (validação e padrão) e o catálogo em memória. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prazoVencido } from '@/server/expiracao';
import { cancelar } from '@/server/acoes/pedidos';
import { CONFIG_PADRAO, lerConfig, salvarConfig } from '@/server/config';
import { catalogo, invalidarCatalogo, produtoPorReferencia } from '@/server/catalogo';
import { criarPedido } from '@/server/pedidos';
import { clientePorNome, db, entrarComo, produtoDeTeste, variante } from './suporte/ajuda';

const DIA = 864e5;
async function pendente(tipo: 'compra' | 'condicional', diasAtras: number, varianteId: number) {
  const c = await clientePorNome('Roberto Lima');
  const p = await criarPedido({ tipo, origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId, quantidade: 1 }] });
  await db.pedido.update({ where: { id: p.id }, data: { criadoEm: new Date(Date.now() - diasAtras * DIA) } });
  return p.id;
}

describe('prazo vencido (Q-05, revisto em D-17): não cancela sozinho; a equipe cancela pelo botão', () => {
  afterEach(() => salvarConfig({ diasExpiracao: 7 }));

  it('pendente vencido continua pendente e com a reserva; aparece como vencido conforme o prazo das configurações', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const velho = await pendente('condicional', 8, v.M);
    const novo = await pendente('condicional', 6, v.M);
    const ler = (id: string) => db.pedido.findUniqueOrThrow({ where: { id }, select: { status: true, criadoEm: true } });
    expect((await ler(velho)).status).toBe('pendente');
    expect((await variante(v.M)).reservado).toBe(2);
    expect(prazoVencido(await ler(velho), (await lerConfig()).diasExpiracao)).toBe(true);
    expect(prazoVencido(await ler(novo), (await lerConfig()).diasExpiracao)).toBe(false);
    await salvarConfig({ diasExpiracao: 0 });
    expect(prazoVencido(await ler(velho), (await lerConfig()).diasExpiracao)).toBe(false); // 0 = sem prazo
    await salvarConfig({ diasExpiracao: 5 });
    expect(prazoVencido(await ler(novo), (await lerConfig()).diasExpiracao)).toBe(true);
  });

  it('a equipe cancela o vencido como "expirado", com motivo e autor; a reserva volta ao estoque', async () => {
    const { v } = await produtoDeTeste({ estoque: { M: 5 } });
    const id = await pendente('condicional', 10, v.M);
    await entrarComo('gestor@dcerutti.local');
    expect(await cancelar(id, 'Prazo vencido sem resposta', { expirado: true })).toEqual({ ok: true });
    expect(await db.pedido.findUniqueOrThrow({ where: { id }, select: { status: true, motivoCancelamento: true } })).toEqual({ status: 'cancelado', motivoCancelamento: 'expirado' });
    expect((await variante(v.M)).reservado).toBe(0);
    const h = await db.pedidoHistorico.findFirstOrThrow({ where: { pedidoId: id, acao: 'cancelado' } });
    expect(h).toMatchObject({ autor: 'equipe', observacao: 'Prazo vencido sem resposta', mudancas: ['Cancelado por prazo vencido'] });
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
