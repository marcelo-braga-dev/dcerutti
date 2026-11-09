/**
 * Vitrines (docs/26): quem pode alterar, preço especial, o que o público vê, o formulário público e o resultado.
 * O público nunca cria pedido, reserva ou ficha, e o preço sempre vem do servidor.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { criarPedidoDoAtendimento } from '@/server/acoes/atendimento';
import { duplicar, incluirPecaNaVitrine, moverPeca, mudarStatus, registrarInteresseVitrine, salvarOferta, salvarVitrine, tirarPecaDaVitrine } from '@/server/acoes/vitrines';
import { destinoDaLive, listarVitrines, resultadoDaVitrine, vitrineParaEdicao, vitrinePublica, vitrinesPublicas } from '@/server/consultas/vitrines';
import { confirmarPedido } from '@/server/pedidos';
import { comoUsuario, db, entrarComo, esperarErroDeCampo, estado, form, produtoDeTeste, redirecionou, usuarioPorEmail, variante } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const celular = () => { const d = String(Date.now() + seq++).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };
const carimbo = () => `${Date.now().toString(36)}${seq++}`;

async function criar(campos: Record<string, string> = {}) {
  const url = await redirecionou(salvarVitrine(vazio, form({ tipo: 'post', titulo: `Vitrine ${carimbo()}`, ...campos })));
  return db.vitrine.findUniqueOrThrow({ where: { id: url.split('/').at(-1)! } });
}

/** Vitrine publicada da Ana, com uma peça de teste. */
async function publicada(o?: Parameters<typeof produtoDeTeste>[0], campos: Record<string, string> = {}) {
  const v = await criar(campos);
  const { produto, v: tamanhos } = await produtoDeTeste(o);
  await incluirPecaNaVitrine(v.id, produto.id);
  expect((await mudarStatus(v.id, 'publicada')).ok).toBe(true);
  return { v, produto, tamanhos };
}

const quero = (slug: string, variantes: number[], telefone = celular(), extra: Record<string, unknown> = {}) => registrarInteresseVitrine(slug, { variantes, nome: 'Fulana Pública', telefone, aceite: true, ...extra });

beforeEach(async () => {
  estado.ip = `10.9.${seq % 250}.${++seq % 250}`;
  await entrarComo('ana@dcerutti.local');
});

describe('permissões', () => {
  it('sem sessão e cliente não entram; outra vendedora não vê nem altera; gestor vê tudo', async () => {
    const v = await criar();
    const { produto } = await produtoDeTeste();
    await entrarComo(null);
    expect(await redirecionou(salvarVitrine(vazio, form({})))).toBe('/entrar');
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(mudarStatus(v.id, 'publicada'))).toBe('/');

    await entrarComo('carlos@dcerutti.local');
    const carlos = await comoUsuario('carlos@dcerutti.local');
    expect(await vitrineParaEdicao(carlos, v.id)).toBeNull();
    expect(await resultadoDaVitrine(carlos, v.id)).toBeNull();
    expect((await listarVitrines(carlos, {})).some(x => x.id === v.id)).toBe(false);
    expect((await incluirPecaNaVitrine(v.id, produto.id)).erro).toBe('Vitrine não encontrada.');
    expect((await mudarStatus(v.id, 'publicada')).erro).toBe('Vitrine não encontrada.');
    expect((await duplicar(v.id)).erro).toBe('Vitrine não encontrada.');
    expect((await salvarVitrine(vazio, form({ id: v.id, tipo: 'post', titulo: 'Invadida' }))).erro).toBe('Vitrine não encontrada.');

    const gestor = await comoUsuario('gestor@dcerutti.local');
    expect(await vitrineParaEdicao(gestor, v.id)).not.toBeNull();
    expect((await listarVitrines(gestor, {})).some(x => x.id === v.id)).toBe(true);
  });

  it('gestor precisa escolher quem atende; a vendedora fica com a dela', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    expect((await criar()).responsavelId).toBe(ana.id);
    await entrarComo('gestor@dcerutti.local');
    esperarErroDeCampo(await salvarVitrine(vazio, form({ tipo: 'post', titulo: 'Sem dona' })), 'responsavelId');
    expect((await criar({ responsavelId: ana.id })).responsavelId).toBe(ana.id);
  });
});

describe('cadastro', () => {
  it('valida e não aceita link fora do Instagram', async () => {
    esperarErroDeCampo(await salvarVitrine(vazio, form({ tipo: 'x', titulo: 'Tipo ruim' })), 'tipo');
    esperarErroDeCampo(await salvarVitrine(vazio, form({ tipo: 'post', titulo: 'A' })), 'titulo');
    for (const u of ['javascript:alert(1)', 'https://falso.com/x', 'http://instagram.com/x'])
      esperarErroDeCampo(await salvarVitrine(vazio, form({ tipo: 'post', titulo: 'Link ruim', urlInstagram: u })), 'urlInstagram');
  });

  it('o endereço não repete e não muda ao trocar o título', async () => {
    const t = `Mesmo Título ${carimbo()}`;
    const a = await criar({ titulo: t }), b = await criar({ titulo: t });
    expect(a.slug).not.toBe(b.slug);
    expect(b.slug).toBe(`${a.slug}-2`);
    expect((await salvarVitrine(vazio, form({ id: a.id, tipo: 'post', titulo: 'Outro título' }))).ok).toBe(true);
    expect((await db.vitrine.findUniqueOrThrow({ where: { id: a.id } })).slug).toBe(a.slug);
  });

  it('peças: não repete, ordena e tira', async () => {
    const v = await criar();
    const a = await produtoDeTeste(), b = await produtoDeTeste();
    await incluirPecaNaVitrine(v.id, a.produto.id);
    await incluirPecaNaVitrine(v.id, b.produto.id);
    expect((await incluirPecaNaVitrine(v.id, a.produto.id)).erro).toMatch(/já está/);
    const inativa = await produtoDeTeste({ ativo: false });
    expect((await incluirPecaNaVitrine(v.id, inativa.produto.id)).ok).toBe(false);
    const ordem = async () => (await db.vitrinePeca.findMany({ where: { vitrineId: v.id }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] }));
    const [p1, p2] = await ordem();
    expect((await moverPeca(v.id, p2.id, -1)).ok).toBe(true);
    expect((await ordem()).map(p => p.id)).toEqual([p2.id, p1.id]);
    await moverPeca(v.id, p2.id, -1);
    expect((await ordem()).map(p => p.id)).toEqual([p2.id, p1.id]);
    expect((await tirarPecaDaVitrine(v.id, p1.id)).ok).toBe(true);
    expect(await ordem()).toHaveLength(1);
  });

  it('duplicar copia peças e preços, em rascunho, sem data nem link', async () => {
    const v = await criar({ urlInstagram: 'https://www.instagram.com/p/x/', inicioPrevisto: '2030-01-01T10:00' });
    const { produto } = await produtoDeTeste({ preco: 100 });
    await incluirPecaNaVitrine(v.id, produto.id);
    const peca = await db.vitrinePeca.findFirstOrThrow({ where: { vitrineId: v.id } });
    await salvarOferta(v.id, peca.id, '95');
    const url = await redirecionou(duplicar(v.id));
    const c = await db.vitrine.findUniqueOrThrow({ where: { id: url.split('/').at(-1)! }, include: { pecas: true } });
    expect(c).toMatchObject({ status: 'rascunho', urlInstagram: null, inicioPrevisto: null });
    expect(c.slug).not.toBe(v.slug);
    expect(Number(c.pecas[0].precoOferta)).toBe(95);
  });
});

describe('preço especial', () => {
  it('abaixo do catálogo; vendedora dentro do limite; gestor sem limite; em branco tira', async () => {
    const v = await criar();
    const { produto } = await produtoDeTeste({ preco: 100 });
    await incluirPecaNaVitrine(v.id, produto.id);
    const p = await db.vitrinePeca.findFirstOrThrow({ where: { vitrineId: v.id } });
    const oferta = async () => (await db.vitrinePeca.findUniqueOrThrow({ where: { id: p.id } })).precoOferta;
    expect((await salvarOferta(v.id, p.id, '100')).erro).toMatch(/menor/);
    expect((await salvarOferta(v.id, p.id, '0')).ok).toBe(false);
    expect((await salvarOferta(v.id, p.id, 'abc')).ok).toBe(false);
    expect((await salvarOferta(v.id, p.id, '50')).erro).toMatch(/desconto máximo/);
    expect((await salvarOferta(v.id, p.id, '90')).ok).toBe(true);
    expect(Number(await oferta())).toBe(90);
    await entrarComo('gestor@dcerutti.local');
    expect((await salvarOferta(v.id, p.id, '50,00')).ok).toBe(true);
    expect(Number(await oferta())).toBe(50);
    expect((await salvarOferta(v.id, p.id, '')).ok).toBe(true);
    expect(await oferta()).toBeNull();
  });
});

describe('situações', () => {
  it('não publica sem peça; live precisa de data; só uma no ar', async () => {
    const vazia = await criar();
    expect((await mudarStatus(vazia.id, 'publicada')).erro).toMatch(/peça/);
    expect((await mudarStatus(vazia.id, 'encerrada')).ok).toBe(false);
    const { produto } = await produtoDeTeste();
    const a = await criar({ tipo: 'live' });
    await incluirPecaNaVitrine(a.id, produto.id);
    expect((await mudarStatus(a.id, 'agendada')).erro).toMatch(/data/);
    await salvarVitrine(vazio, form({ id: a.id, tipo: 'live', titulo: a.titulo, inicioPrevisto: '2030-01-01T19:30' }));
    expect((await db.vitrine.findUniqueOrThrow({ where: { id: a.id } })).inicioPrevisto?.toISOString()).toBe('2030-01-01T22:30:00.000Z');
    expect((await mudarStatus(a.id, 'agendada')).ok).toBe(true);
    expect((await mudarStatus(a.id, 'no_ar')).ok).toBe(true);
    expect(await destinoDaLive()).toBe(`/vitrine/${a.slug}`);

    const b = await criar({ tipo: 'live', inicioPrevisto: '2030-02-01T19:30' });
    await incluirPecaNaVitrine(b.id, produto.id);
    await mudarStatus(b.id, 'agendada');
    expect((await mudarStatus(b.id, 'no_ar')).erro).toMatch(/já há uma live/i);
    expect((await mudarStatus(a.id, 'encerrada')).ok).toBe(true);
    const encerrada = await db.vitrine.findUniqueOrThrow({ where: { id: a.id } });
    expect(encerrada.inicioEm).not.toBeNull();
    expect(encerrada.fimEm).not.toBeNull();
    expect(await destinoDaLive()).not.toBe(`/vitrine/${a.slug}`);
    await db.vitrine.update({ where: { id: b.id }, data: { status: 'arquivada' } });
  });
});

describe('o que o público vê', () => {
  it('rascunho só para a equipe; arquivada para ninguém; sem custo nem estoque exato', async () => {
    const v = await criar();
    const { produto, ref } = await produtoDeTeste({ estoque: { P: 9, M: 1, G: 0 }, custo: 77 });
    await incluirPecaNaVitrine(v.id, produto.id);
    expect(await vitrinePublica(v.slug)).toBeNull();
    expect(await vitrinePublica(v.slug, true)).not.toBeNull();
    await mudarStatus(v.id, 'publicada');
    const p = (await vitrinePublica(v.slug))!;
    expect(p.pecas[0].variantes.map(t => [t.tamanho, t.ultimas])).toEqual([['P', false], ['M', true]]);
    expect(JSON.stringify(p)).not.toMatch(/custo|estoque|disponivel|codigoInterno|"reservado"/i);
    expect((await vitrinesPublicas()).publicadas.some(x => x.slug === v.slug)).toBe(true);
    expect(ref).toBeTruthy();
    await mudarStatus(v.id, 'encerrada');
    expect((await vitrinesPublicas()).publicadas.some(x => x.slug === v.slug)).toBe(false);
    expect(await vitrinePublica(v.slug)).not.toBeNull();
    await mudarStatus(v.id, 'arquivada');
    expect(await vitrinePublica(v.slug)).toBeNull();
    expect(await vitrinePublica(v.slug, true)).toBeNull();
  });

  it('preço especial some ao vencer e ao encerrar', async () => {
    const { v, produto } = await publicada({ preco: 100 });
    const p = await db.vitrinePeca.findFirstOrThrow({ where: { vitrineId: v.id, produtoId: produto.id } });
    await salvarOferta(v.id, p.id, '90');
    expect((await vitrinePublica(v.slug))!.pecas[0].preco).toBe(90);
    await db.vitrine.update({ where: { id: v.id }, data: { ofertaAte: new Date(Date.now() - 60_000) } });
    const vencida = (await vitrinePublica(v.slug))!;
    expect(vencida.pecas[0].preco).toBe(100);
    expect(vencida.ofertaAte).toBeNull();
    await db.vitrine.update({ where: { id: v.id }, data: { ofertaAte: null } });
    await mudarStatus(v.id, 'encerrada');
    expect((await vitrinePublica(v.slug))!.pecas[0].preco).toBe(100);
  });
});

describe('formulário público', () => {
  it('registra para a responsável, sem ficha, pedido nem reserva', async () => {
    const { v, tamanhos } = await publicada();
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const tel = celular();
    await entrarComo(null);
    const fichas = await db.cliente.count(), pedidos = await db.pedido.count();
    const r = await quero(v.slug, [tamanhos.P, tamanhos.M], tel);
    expect(r).toMatchObject({ ok: true, destinatario: 'Ana' });
    expect(r.ok && r.url).toContain('phone=5549988904646');
    const a = await db.atendimento.findFirstOrThrow({ where: { contatoTelefone: tel }, include: { itens: true } });
    expect(a).toMatchObject({ responsavelId: ana.id, canal: 'vitrine', vitrineId: v.id, clienteId: null });
    expect(a.itens.map(i => i.varianteId).sort()).toEqual([tamanhos.P, tamanhos.M].sort());
    expect(await db.cliente.count()).toBe(fichas);
    expect(await db.pedido.count()).toBe(pedidos);
    expect((await variante(tamanhos.P)).reservado).toBe(0);
  });

  it('live usa o canal live; telefone de outra carteira vai para a dona, com a mesma resposta', async () => {
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const ficha = await db.cliente.create({ data: { nome: 'Ficha Secreta', telefone: celular(), vendedorId: carlos.id } });
    const v = await criar({ tipo: 'live', inicioPrevisto: '2031-01-01T19:30' });
    const { produto, v: tamanhos } = await produtoDeTeste();
    await incluirPecaNaVitrine(v.id, produto.id);
    await mudarStatus(v.id, 'agendada');
    const conhecido = await quero(v.slug, [tamanhos.P], ficha.telefone);
    const desconhecido = await quero(v.slug, [tamanhos.P]);
    const sem = (r: typeof conhecido) => (r.ok ? decodeURIComponent(r.url).replace(/AT-\d+/, 'AT') : r.erro);
    expect(sem(conhecido)).toBe(sem(desconhecido));
    expect(JSON.stringify(conhecido)).not.toMatch(/Carlos|Secreta/);
    expect(await db.atendimento.findFirstOrThrow({ where: { clienteId: ficha.id } })).toMatchObject({ responsavelId: carlos.id, canal: 'live', vitrineId: v.id });
    await db.vitrine.update({ where: { id: v.id }, data: { status: 'arquivada' } });
  });

  it('recusa: peça de fora, peça esgotada, sem aceite, telefone ruim, vitrine encerrada ou em rascunho', async () => {
    const { v, tamanhos } = await publicada({ estoque: { P: 1, G: 0 } });
    const outra = await produtoDeTeste();
    const antes = await db.atendimento.count();
    expect((await quero(v.slug, [outra.v.P])).ok).toBe(false);
    expect((await quero(v.slug, [tamanhos.P, outra.v.P])).ok).toBe(false);
    expect((await quero(v.slug, [tamanhos.G])).ok).toBe(false);
    expect((await quero(v.slug, [])).ok).toBe(false);
    expect((await quero(v.slug, [tamanhos.P], celular(), { aceite: false })).ok).toBe(false);
    expect((await quero(v.slug, [tamanhos.P], '123')).ok).toBe(false);
    const rascunho = await criar();
    expect((await quero(rascunho.slug, [tamanhos.P])).ok).toBe(false);
    await mudarStatus(v.id, 'encerrada');
    expect((await quero(v.slug, [tamanhos.P])).ok).toBe(false);
    expect((await quero('nao-existe', [tamanhos.P])).ok).toBe(false);
    expect(await db.atendimento.count()).toBe(antes);
  });

  it('robô não grava; limite por conexão vale aqui também', async () => {
    const { v, tamanhos } = await publicada();
    const tel = celular();
    expect((await quero(v.slug, [tamanhos.P], tel, { site: 'http://spam' })).ok).toBe(true);
    expect(await db.atendimento.count({ where: { contatoTelefone: tel } })).toBe(0);
    estado.ip = '10.8.0.1';
    const r = [];
    for (let i = 0; i < 11; i++) r.push(await quero(v.slug, [tamanhos.P]));
    expect(r[9].ok).toBe(true);
    expect(r[10]).toMatchObject({ ok: false, erro: expect.stringContaining('Muitos pedidos') });
  });
});

describe('do atendimento ao resultado', () => {
  it('o pedido sai com o preço especial, e o resultado usa a venda', async () => {
    const { v, produto, tamanhos } = await publicada({ preco: 100 });
    const peca = await db.vitrinePeca.findFirstOrThrow({ where: { vitrineId: v.id, produtoId: produto.id } });
    await salvarOferta(v.id, peca.id, '90');
    const tel = celular();
    await quero(v.slug, [tamanhos.P], tel);
    const a = await db.atendimento.findFirstOrThrow({ where: { contatoTelefone: tel } });
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const c = await db.cliente.create({ data: { nome: 'Confirmada', telefone: tel, vendedorId: ana.id } });
    await db.atendimento.update({ where: { id: a.id }, data: { clienteId: c.id, contatoNome: null, contatoTelefone: null } });

    const r = await criarPedidoDoAtendimento(a.id, 'compra');
    expect(r.ok).toBe(true);
    const p = await db.pedido.findUniqueOrThrow({ where: { id: r.pedidoId! }, include: { itens: true } });
    expect(p.vitrineId).toBe(v.id);
    expect(Number(p.itens[0].precoUnitario)).toBe(90);
    expect(Number(p.itens[0].precoTabela)).toBe(100);

    const eu = await comoUsuario('ana@dcerutti.local');
    expect(await resultadoDaVitrine(eu, v.id)).toMatchObject({ atendimentos: 1, ganhos: 0, pedidos: 1, vendas: 0, valorAberto: 90, valorVendido: 0, conversao: 0 });
    await confirmarPedido(p.id, {}, ana.id);
    const res = (await resultadoDaVitrine(eu, v.id))!;
    expect(res).toMatchObject({ atendimentos: 1, ganhos: 1, pedidos: 1, vendas: 1, valorAberto: 0, valorVendido: 90, conversao: 100 });
    expect(res.pecas[0]).toMatchObject({ produtoId: produto.id, pedidas: 1, vendidas: 1 });
  });

  it('oferta vencida: o pedido sai pelo preço do catálogo', async () => {
    const { v, produto, tamanhos } = await publicada({ preco: 100 });
    const peca = await db.vitrinePeca.findFirstOrThrow({ where: { vitrineId: v.id, produtoId: produto.id } });
    await salvarOferta(v.id, peca.id, '90');
    const tel = celular();
    await quero(v.slug, [tamanhos.P], tel);
    const a = await db.atendimento.findFirstOrThrow({ where: { contatoTelefone: tel } });
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const c = await db.cliente.create({ data: { nome: 'Atrasada', telefone: tel, vendedorId: ana.id } });
    await db.atendimento.update({ where: { id: a.id }, data: { clienteId: c.id, contatoNome: null, contatoTelefone: null } });
    await db.vitrine.update({ where: { id: v.id }, data: { ofertaAte: new Date(Date.now() - 60_000) } });
    const r = await criarPedidoDoAtendimento(a.id, 'compra');
    const p = await db.pedido.findUniqueOrThrow({ where: { id: r.pedidoId! }, include: { itens: true } });
    expect(Number(p.itens[0].precoUnitario)).toBe(100);
  });
});
