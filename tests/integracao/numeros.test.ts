/**
 * Números de WhatsApp da loja (D-31): só a gestora altera, cliques simultâneos não duplicam, o histórico não é
 * reescrito, e a cliente fala com o número certo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarConta } from '@/server/contas';
import { lerConfig } from '@/server/config';
import { criarPedido } from '@/server/pedidos';
import { enviarPedido } from '@/server/acoes/pedidos';
import { desativarVendedor } from '@/server/acoes/gestao';
import { ligarPessoa, marcarConectada, marcarDesconectada, moverPessoa, mudarStatusDoNumero, salvarNumero, tirarPessoa, tornarPadrao, tornarPrincipal, verImpacto } from '@/server/acoes/numeros';
import { detalheDoNumero, impactoDaRemocao, quadroDeNumeros } from '@/server/consultas/numeros';
import { atendimentoDoCliente } from '@/server/consultas/clientes';
import { sugestaoPublica } from '@/server/sugestoes';
import { comoUsuario, db, entrarComo, esperarErroDeCampo, form, produtoDeTeste, redirecionou, usuarioPorEmail } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const telefone = () => `4997${String(Date.now() + seq++).slice(-7)}`;
const novoNumero = (apelido = 'Teste') => db.numeroWhatsApp.create({ data: { telefone: telefone(), apelido } });
const abertos = (numeroId: number) => db.vinculoNumero.findMany({ where: { numeroId, fimEm: null } });
const principalDe = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).numeroPrincipalId;

async function novaVendedora() {
  const n = seq++;
  return criarConta(db, { nome: `Vendedora ${n}`, email: `numeros.${Date.now()}.${n}@exemplo.com`, senha: 'senha-teste-1', papel: 'vendedor' });
}

const gustavoEmail = 'gustavo@dcerutti.local';
const LOJA = '49988036499';

beforeEach(() => entrarComo('gestor@dcerutti.local'));

describe('permissões', () => {
  it('sem sessão, cliente e vendedora não alteram nem consultam', async () => {
    const n = await novoNumero();
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    await entrarComo(null);
    expect(await redirecionou(ligarPessoa(n.id, ana.id))).toBe('/entrar');
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(salvarNumero(vazio, form({})))).toBe('/');
    await entrarComo('ana@dcerutti.local');
    for (const p of [ligarPessoa(n.id, ana.id), tirarPessoa({ numeroId: n.id, usuarioId: ana.id }), moverPessoa(n.id, n.id, ana.id), tornarPrincipal(n.id, ana.id), marcarConectada(1), marcarDesconectada(1), mudarStatusDoNumero(n.id, 'pausado'), tornarPadrao(n.id), verImpacto(n.id, ana.id), salvarNumero(vazio, form({}))])
      expect(await redirecionou(p)).toBe('/painel');
    const vendedora = await comoUsuario('ana@dcerutti.local');
    await expect(quadroDeNumeros(vendedora)).rejects.toThrow('restrita ao gestor');
    await expect(detalheDoNumero(vendedora, n.id)).rejects.toThrow('restrita ao gestor');
    await expect(impactoDaRemocao(vendedora, n.id, ana.id)).rejects.toThrow('restrita ao gestor');
    expect(await abertos(n.id)).toEqual([]);
  });
});

describe('cadastro', () => {
  it('valida, guarda só os dígitos e recusa telefone repetido', async () => {
    esperarErroDeCampo(await salvarNumero(vazio, form({ telefone: '123', apelido: 'Loja X' })), 'telefone');
    esperarErroDeCampo(await salvarNumero(vazio, form({ telefone: '(49) 97000-0001', apelido: 'X' })), 'apelido');
    const t = telefone();
    const mascara = `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
    expect((await salvarNumero(vazio, form({ telefone: mascara, apelido: 'Loja Nova' }))).ok).toBe(true);
    const n = await db.numeroWhatsApp.findUniqueOrThrow({ where: { telefone: t } });
    expect(n).toMatchObject({ apelido: 'Loja Nova', status: 'ativo', padrao: false });
    expect((await salvarNumero(vazio, form({ telefone: mascara, apelido: 'De novo' }))).erro).toBe('Este telefone já está cadastrado.');
  });

  it('número com histórico não troca de telefone, mas troca de nome', async () => {
    const n = await novoNumero();
    const v = await novaVendedora();
    await ligarPessoa(n.id, v.id);
    const t = (x: string) => `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
    expect((await salvarNumero(vazio, form({ id: n.id, telefone: t(telefone()), apelido: 'Outro' }))).erro).toMatch(/histórico/);
    expect((await salvarNumero(vazio, form({ id: n.id, telefone: t(n.telefone), apelido: 'Nome novo' }))).ok).toBe(true);
    expect((await db.numeroWhatsApp.findUniqueOrThrow({ where: { id: n.id } })).apelido).toBe('Nome novo');
  });
});

describe('vínculos', () => {
  it('o primeiro número ativo vira o principal da vendedora; gestora tem acesso, mas não principal', async () => {
    const v = await novaVendedora(), a = await novoNumero('A'), b = await novoNumero('B');
    expect((await ligarPessoa(a.id, v.id)).ok).toBe(true);
    expect((await ligarPessoa(b.id, v.id)).ok).toBe(true);
    expect(await principalDe(v.id)).toBe(a.id);
    expect((await tornarPrincipal(b.id, v.id)).ok).toBe(true);
    expect(await principalDe(v.id)).toBe(b.id);
    const gestor = await usuarioPorEmail('supervisora@dcerutti.local');
    expect((await ligarPessoa(a.id, gestor.id)).ok).toBe(true);
    expect(await principalDe(gestor.id)).toBeNull();
    expect((await tornarPrincipal(a.id, gestor.id)).erro).toMatch(/gestor/);
    await tirarPessoa({ numeroId: a.id, usuarioId: gestor.id });
  });

  it('dois cliques ao mesmo tempo criam um vínculo só', async () => {
    const v = await novaVendedora(), n = await novoNumero();
    const r = await Promise.all([ligarPessoa(n.id, v.id), ligarPessoa(n.id, v.id), ligarPessoa(n.id, v.id)]);
    expect(r.filter(x => x.ok)).toHaveLength(1);
    expect(r.find(x => !x.ok)?.erro).toMatch(/já está/);
    expect(await abertos(n.id)).toHaveLength(1);
  });

  it('recusa pessoa inativa, cliente, número desativado e principal sem vínculo', async () => {
    const n = await novoNumero(), fabio = await usuarioPorEmail('fabio@dcerutti.local'), cliente = await usuarioPorEmail('cliente@dcerutti.local');
    expect((await ligarPessoa(n.id, fabio.id)).ok).toBe(false);
    expect((await ligarPessoa(n.id, cliente.id)).ok).toBe(false);
    expect((await tornarPrincipal(n.id, (await novaVendedora()).id)).erro).toMatch(/primeiro/);
    await mudarStatusDoNumero(n.id, 'desativado');
    expect((await ligarPessoa(n.id, (await novaVendedora()).id)).erro).toMatch(/desativado/);
  });

  it('remover aparelho conectado deixa pendência até confirmar; sem conexão, não deixa', async () => {
    const v = await novaVendedora(), n = await novoNumero();
    await ligarPessoa(n.id, v.id);
    const vinculo = (await abertos(n.id))[0];
    expect((await marcarConectada(vinculo.id)).ok).toBe(true);
    expect((await marcarConectada(vinculo.id)).ok).toBe(false);
    const r = await tirarPessoa({ numeroId: n.id, usuarioId: v.id, motivo: 'Férias' });
    expect(r).toMatchObject({ ok: true, aviso: expect.stringContaining('desconecte') });
    const encerrado = await db.vinculoNumero.findUniqueOrThrow({ where: { id: vinculo.id } });
    expect(encerrado).toMatchObject({ motivoFim: 'Férias', desconectadoEm: null, conexao: 'conectado' });
    expect(encerrado.fimEm).not.toBeNull();
    expect(await principalDe(v.id)).toBeNull();
    const gestor = await comoUsuario('gestor@dcerutti.local');
    expect((await quadroDeNumeros(gestor)).pendencias.some(p => p.id === vinculo.id)).toBe(true);
    expect((await marcarDesconectada(vinculo.id)).ok).toBe(true);
    expect((await marcarDesconectada(vinculo.id)).ok).toBe(false);
    expect((await quadroDeNumeros(gestor)).pendencias.some(p => p.id === vinculo.id)).toBe(false);

    await ligarPessoa(n.id, v.id);
    expect((await tirarPessoa({ numeroId: n.id, usuarioId: v.id })).aviso).toBeUndefined();
    expect(await db.vinculoNumero.count({ where: { numeroId: n.id, usuarioId: v.id } })).toBe(2);
    expect(await db.vinculoNumero.count({ where: { numeroId: n.id, fimEm: { not: null }, desconectadoEm: null } })).toBe(0);
  });

  it('ao sair do principal, outro número ativo dela assume', async () => {
    const v = await novaVendedora(), a = await novoNumero('A'), b = await novoNumero('B');
    await ligarPessoa(a.id, v.id);
    await ligarPessoa(b.id, v.id);
    await tirarPessoa({ numeroId: a.id, usuarioId: v.id });
    expect(await principalDe(v.id)).toBe(b.id);
  });

  it('mover encerra e abre de uma vez, e o principal acompanha', async () => {
    const v = await novaVendedora(), a = await novoNumero('Origem'), b = await novoNumero('Destino');
    await ligarPessoa(a.id, v.id);
    expect((await moverPessoa(a.id, b.id, v.id)).ok).toBe(true);
    expect(await abertos(a.id)).toEqual([]);
    expect((await abertos(b.id)).map(x => x.usuarioId)).toEqual([v.id]);
    expect(await principalDe(v.id)).toBe(b.id);
    const antigo = await db.vinculoNumero.findFirstOrThrow({ where: { numeroId: a.id, usuarioId: v.id } });
    expect(antigo.motivoFim).toBe('Mudou para Destino');
    expect((await moverPessoa(a.id, b.id, v.id)).ok).toBe(false);
    expect((await moverPessoa(b.id, b.id, v.id)).ok).toBe(false);
  });

  it('a carteira só muda se a gestora escolher', async () => {
    const v = await novaVendedora(), outra = await novaVendedora(), n = await novoNumero();
    await ligarPessoa(n.id, v.id);
    const c = await db.cliente.create({ data: { nome: 'Cliente da carteira', telefone: '(49) 97000-1234', vendedorId: v.id } });
    const { v: tamanhos } = await produtoDeTeste();
    const p = await criarPedido({ tipo: 'compra', origem: 'vendedor', clienteId: c.id, vendedorId: v.id, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: tamanhos.P, quantidade: 1 }] });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).numeroId).toBe(n.id);

    const impacto = await verImpacto(n.id, v.id);
    expect(impacto).toMatchObject({ clientes: 1, pendentes: 1, principal: true, ficaSemNumero: true, podeTransferir: true });
    expect(impacto!.vendedoras.some(x => x.id === v.id)).toBe(false);

    expect((await tirarPessoa({ numeroId: n.id, usuarioId: v.id, transferirPara: v.id })).ok).toBe(false);
    expect((await abertos(n.id))).toHaveLength(1);
    expect((await tirarPessoa({ numeroId: n.id, usuarioId: v.id })).ok).toBe(true);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).vendedorId).toBe(v.id);

    await ligarPessoa(n.id, v.id);
    expect((await tirarPessoa({ numeroId: n.id, usuarioId: v.id, transferirPara: outra.id })).ok).toBe(true);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).vendedorId).toBe(outra.id);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).vendedorId).toBe(outra.id);
  });

  it('desativar a vendedora encerra os vínculos e deixa a pendência de desconectar', async () => {
    const v = await novaVendedora(), n = await novoNumero();
    await ligarPessoa(n.id, v.id);
    await marcarConectada((await abertos(n.id))[0].id);
    expect((await desativarVendedor(vazio, form({ id: v.id }))).ok).toBe(true);
    expect(await abertos(n.id)).toEqual([]);
    expect(await principalDe(v.id)).toBeNull();
    expect(await db.vinculoNumero.count({ where: { numeroId: n.id, usuarioId: v.id, motivoFim: 'Vendedor desativado', desconectadoEm: null } })).toBe(1);
  });
});

describe('situação e número padrão', () => {
  afterAll(async () => {
    const loja = await db.numeroWhatsApp.findUniqueOrThrow({ where: { telefone: LOJA } });
    await entrarComo('gestor@dcerutti.local');
    await tornarPadrao(loja.id);
  });

  it('pausar mantém as pessoas e tira o principal; desativar encerra; o padrão fica protegido', async () => {
    const v = await novaVendedora(), n = await novoNumero();
    await ligarPessoa(n.id, v.id);
    expect((await mudarStatusDoNumero(n.id, 'pausado')).ok).toBe(true);
    expect(await principalDe(v.id)).toBeNull();
    expect(await abertos(n.id)).toHaveLength(1);
    expect((await tornarPrincipal(n.id, v.id)).ok).toBe(false);
    expect((await mudarStatusDoNumero(n.id, 'ativo')).ok).toBe(true);
    expect((await tornarPrincipal(n.id, v.id)).ok).toBe(true);
    expect((await mudarStatusDoNumero(n.id, 'desativado')).ok).toBe(true);
    expect(await abertos(n.id)).toEqual([]);
    const padrao = await db.numeroWhatsApp.findFirstOrThrow({ where: { padrao: true } });
    expect((await mudarStatusDoNumero(padrao.id, 'pausado')).erro).toMatch(/padrão/);
    expect((await mudarStatusDoNumero(padrao.id, 'desativado')).erro).toMatch(/padrão/);
  });

  it('trocar o padrão deixa só um e atualiza o whatsappLoja', async () => {
    const n = await novoNumero('Novo padrão');
    expect((await tornarPadrao(n.id)).ok).toBe(true);
    expect((await db.numeroWhatsApp.findMany({ where: { padrao: true } })).map(x => x.id)).toEqual([n.id]);
    expect((await lerConfig()).whatsappLoja).toBe(n.telefone);
    const pausado = await novoNumero('Pausado');
    await mudarStatusDoNumero(pausado.id, 'pausado');
    expect((await tornarPadrao(pausado.id)).ok).toBe(false);
  });
});

describe('o número que a cliente vê', () => {
  let numeroId = 0;
  let gustavoId = '';
  beforeAll(async () => {
    numeroId = (await novoNumero('Da Tânia')).id;
    gustavoId = (await usuarioPorEmail(gustavoEmail)).id;
  });
  afterAll(async () => {
    await entrarComo('gestor@dcerutti.local');
    await tirarPessoa({ numeroId, usuarioId: gustavoId });
  });

  it('sem número vai para o padrão; ligada, vai para o número dela; o pedido guarda por qual número foi', async () => {
    const { v } = await produtoDeTeste();
    const numero = await db.numeroWhatsApp.findUniqueOrThrow({ where: { id: numeroId } });
    const padrao = await db.numeroWhatsApp.findFirstOrThrow({ where: { padrao: true } });

    await entrarComo('cliente.gustavo@dcerutti.local');
    const antes = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.P, quantidade: 1 }] });
    expect(antes.ok && antes.destinatario).toBe('a loja');
    expect(antes.ok && antes.url).toContain(`phone=55${padrao.telefone}&`);
    expect(antes.ok && (await db.pedido.findUniqueOrThrow({ where: { codigo: antes.codigo! } })).numeroId).toBe(padrao.id);

    await entrarComo('gestor@dcerutti.local');
    await ligarPessoa(numeroId, gustavoId);

    const cliente = await entrarComo('cliente.gustavo@dcerutti.local');
    expect(await atendimentoDoCliente(cliente!)).toMatchObject({ telefone: numero.telefone });
    const depois = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.M, quantidade: 1 }] });
    expect(depois.ok && depois.destinatario).toBe('Gustavo');
    expect(depois.ok && depois.url).toContain(`phone=55${numero.telefone}&`);
    expect(depois.ok && (await db.pedido.findUniqueOrThrow({ where: { codigo: depois.codigo! } })).numeroId).toBe(numeroId);
  });

  it('venda no balcão não fica ligada a número', async () => {
    const { v } = await produtoDeTeste();
    const c = await db.cliente.findFirstOrThrow({ where: { vendedorId: gustavoId, NOT: { telefone: '' } } });
    const p = await criarPedido({ tipo: 'compra', origem: 'balcao', clienteId: c.id, vendedorId: gustavoId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).numeroId).toBeNull();
  });

  it('o contato da sugestão usa o número da vendedora', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const s = await db.sugestao.findFirst({ where: { vendedorId: ana.id } });
    if (!s) return;
    const numero = await db.numeroWhatsApp.findFirstOrThrow({ where: { id: ana.numeroPrincipalId! } });
    expect((await sugestaoPublica(s.codigo))?.telefoneContato).toBe(numero.telefone);
  });
});

describe('uso e histórico', () => {
  it('o quadro e a página do número mostram o que aconteceu', async () => {
    const v = await novaVendedora(), n = await novoNumero('Com histórico');
    await ligarPessoa(n.id, v.id);
    await db.atividadeEquipe.create({ data: { usuarioId: v.id, tipo: 'whatsapp', numeroId: n.id, descricao: 'Fulana' } });
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const quadro = await quadroDeNumeros(gestor);
    const noQuadro = quadro.numeros.find(x => x.id === n.id)!;
    const padrao = quadro.numeros.find(x => x.padrao)!;
    const gustavo = await usuarioPorEmail(gustavoEmail);
    expect(padrao.clientes).toBeGreaterThanOrEqual(await db.cliente.count({ where: { vendedorId: gustavo.id, NOT: { telefone: '' } } }));
    expect(noQuadro.vinculos[0]).toMatchObject({ usuarioId: v.id, principal: true, conexao: 'aguardando', ultimoUso: 'agora' });
    await tirarPessoa({ numeroId: n.id, usuarioId: v.id });
    const d = await detalheDoNumero(gestor, n.id);
    expect(d!.vinculos[0]).toMatchObject({ vinculadoPor: gestor.name, encerradoPor: gestor.name });
    expect(d!.usos).toContainEqual(expect.objectContaining({ quem: v.name, descricao: 'Fulana' }));
    expect(await detalheDoNumero(gestor, 99_999_999)).toBeNull();
  });
});
