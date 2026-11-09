/**
 * Pós-venda (docs/26): o que é programado, quem vê na fila, oferta só com aceite, venda desfeita, situação do pedido,
 * consentimento e indicadores.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { salvarCliente } from '@/server/acoes/clientes';
import { atualizarMeusDados, excluirMinhaConta } from '@/server/acoes/conta';
import { registrarInteresse } from '@/server/acoes/peca';
import { concluirPosVenda, descadastrarDeOfertas, posVendaViraAtendimento, salvarSituacaoDoPedido } from '@/server/acoes/pos-venda';
import { salvarContato } from '@/server/acoes/atendimento';
import { salvarConfig, lerConfig } from '@/server/config';
import { contarFila, filaDeHoje, indicadoresAtendimento, visaoDaEquipe } from '@/server/consultas/atendimento';
import { criarConta } from '@/server/contas';
import { chaveDaPeca } from '@/server/link-pedido';
import { cancelarPedido, confirmarPedido, criarPedido, desfazerVenda } from '@/server/pedidos';
import { DIAS_POS_VENDA } from '@/lib/pos-venda';
import { comoUsuario, db, entrarComo, estado, esperarErroDeCampo, form, produtoDeTeste, redirecionou, usuarioPorEmail } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const celular = () => { const d = String(Date.now() + seq++).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };

async function clienteDaAna(dados: Record<string, unknown> = {}) {
  const ana = await usuarioPorEmail('ana@dcerutti.local');
  return db.cliente.create({ data: { nome: `Cliente ${seq++}`, telefone: celular(), vendedorId: ana.id, ...dados } });
}

/** Venda confirmada; devolve o pedido e os contatos programados. */
async function venda(c: { id: string; nome: string; telefone: string; vendedorId: string }, origem: 'loja' | 'vendedor' | 'balcao' = 'loja') {
  const { v } = await produtoDeTeste();
  const p = await criarPedido({ tipo: 'compra', origem, clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
  await confirmarPedido(p.id, {}, c.vendedorId);
  return { p, contatos: await db.posVendaContato.findMany({ where: { pedidoId: p.id }, orderBy: { venceEm: 'asc' } }) };
}

const vencer = (pedidoId: string, tipos?: string[]) => db.posVendaContato.updateMany({ where: { pedidoId, ...(tipos ? { tipo: { in: tipos as never } } : {}) }, data: { venceEm: new Date(Date.now() - 60_000) } });

beforeAll(() => salvarConfig({ atendimento: { ligado: true, diasPosVenda: DIAS_POS_VENDA } }));
beforeEach(async () => {
  estado.ip = `10.7.${seq % 250}.${++seq % 250}`;
  await entrarComo('ana@dcerutti.local');
});
afterAll(() => salvarConfig({ atendimento: { ligado: true, diasPosVenda: DIAS_POS_VENDA } }));

describe('programação', () => {
  it('venda online programa os quatro; no balcão, só os de oferta', async () => {
    const online = await venda(await clienteDaAna());
    expect(online.contatos.map(c => c.tipo)).toEqual(['entrega', 'satisfacao', 'sugestao', 'reativacao']);
    const balcao = await venda(await clienteDaAna(), 'balcao');
    expect(balcao.contatos.map(c => c.tipo)).toEqual(['sugestao', 'reativacao']);
  });

  it('sem venda ou com o atendimento desligado, nada; dias vêm da configuração', async () => {
    const eu = await usuarioPorEmail('ana@dcerutti.local');
    const c = await clienteDaAna();
    const { v } = await produtoDeTeste();
    const cond = await criarPedido({ tipo: 'condicional', origem: 'vendedor', clienteId: c.id, vendedorId: eu.id, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: cond.id } });
    await confirmarPedido(cond.id, { [item.id]: 0 }, eu.id);
    expect(await db.posVendaContato.count({ where: { pedidoId: cond.id } })).toBe(0);

    await salvarConfig({ atendimento: { ligado: false, diasPosVenda: DIAS_POS_VENDA } });
    expect((await venda(await clienteDaAna())).contatos).toEqual([]);
    await salvarConfig({ atendimento: { ligado: true, diasPosVenda: { ...DIAS_POS_VENDA, entrega: 10 } } });
    const dez = await venda(await clienteDaAna());
    const entrega = dez.contatos.find(x => x.tipo === 'entrega')!;
    expect(Math.round((entrega.venceEm.getTime() - Date.now()) / 86_400_000)).toBe(10);
    await salvarConfig({ atendimento: { ligado: true, diasPosVenda: DIAS_POS_VENDA } });
  });

  it('configuração salva antes do pós-venda continua ligada, com os dias padrão', async () => {
    await db.configuracao.update({ where: { chave: 'atendimento' }, data: { valor: { ligado: true } } });
    expect((await lerConfig()).atendimento).toEqual({ ligado: true, diasPosVenda: DIAS_POS_VENDA });
  });

  it('venda desfeita tira da fila; nova compra encerra a reativação antiga', async () => {
    const eu = await usuarioPorEmail('ana@dcerutti.local');
    const c = await clienteDaAna();
    const a = await venda(c);
    await desfazerVenda(a.p.id, eu.id, 'Devolveu');
    expect((await db.posVendaContato.findMany({ where: { pedidoId: a.p.id } })).every(x => x.resultado === 'venda_desfeita' && x.feitoEm)).toBe(true);

    const b = await venda(c);
    const d = await venda(c);
    const antiga = await db.posVendaContato.findFirstOrThrow({ where: { pedidoId: b.p.id, tipo: 'reativacao' } });
    expect(antiga.resultado).toBe('nova_compra');
    expect((await db.posVendaContato.findFirstOrThrow({ where: { pedidoId: d.p.id, tipo: 'reativacao' } })).feitoEm).toBeNull();
    expect((await db.posVendaContato.findFirstOrThrow({ where: { pedidoId: b.p.id, tipo: 'entrega' } })).feitoEm).toBeNull();
  });

  it('cancelar pedido não confirmado não programa nada', async () => {
    const c = await clienteDaAna();
    const { v } = await produtoDeTeste();
    const p = await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    await cancelarPedido(p.id, 'equipe');
    expect(await db.posVendaContato.count({ where: { pedidoId: p.id } })).toBe(0);
  });
});

describe('fila', () => {
  it('só quando vence, e só para quem cuida da cliente', async () => {
    const eu = await comoUsuario('ana@dcerutti.local');
    const carlos = await comoUsuario('carlos@dcerutti.local');
    const { p, contatos } = await venda(await clienteDaAna());
    const entrega = contatos.find(c => c.tipo === 'entrega')!;
    expect((await filaDeHoje(eu)).posVenda.some(c => c.id === entrega.id)).toBe(false);
    const antes = await contarFila(eu);
    await vencer(p.id, ['entrega']);
    expect((await filaDeHoje(eu)).posVenda.some(c => c.id === entrega.id)).toBe(true);
    expect(await contarFila(eu)).toBe(antes + 1);
    expect((await filaDeHoje(carlos)).posVenda.some(c => c.id === entrega.id)).toBe(false);
    expect((await filaDeHoje(await comoUsuario('gestor@dcerutti.local'))).posVenda.some(c => c.id === entrega.id)).toBe(true);
  });

  it('oferta só com aceite; ao descadastrar, sai; contato do pedido continua', async () => {
    const eu = await comoUsuario('ana@dcerutti.local');
    const c = await clienteDaAna();
    const { p, contatos } = await venda(c);
    await vencer(p.id);
    const naFila = async () => (await filaDeHoje(eu)).posVenda.filter(x => x.pedidoId === p.id).map(x => x.tipo).sort();
    expect(await naFila()).toEqual(['entrega', 'satisfacao']);
    await db.cliente.update({ where: { id: c.id }, data: { aceitaOfertasEm: new Date() } });
    expect(await naFila()).toEqual(['entrega', 'reativacao', 'satisfacao', 'sugestao']);
    expect((await descadastrarDeOfertas(c.id)).ok).toBe(true);
    expect(await naFila()).toEqual(['entrega', 'satisfacao']);
    expect(contatos).toHaveLength(4);
  });

  it('cliente em outra carteira segue a carteira', async () => {
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const c = await clienteDaAna();
    const { p } = await venda(c);
    await vencer(p.id, ['entrega']);
    await db.cliente.update({ where: { id: c.id }, data: { vendedorId: carlos.id } });
    expect((await filaDeHoje(await comoUsuario('ana@dcerutti.local'))).posVenda.some(x => x.pedidoId === p.id)).toBe(false);
    expect((await filaDeHoje(await comoUsuario('carlos@dcerutti.local'))).posVenda.some(x => x.pedidoId === p.id)).toBe(true);
  });
});

describe('concluir', () => {
  it('registra o resultado uma vez; outra vendedora não conclui; resultado inválido é recusado', async () => {
    const { contatos } = await venda(await clienteDaAna());
    const id = contatos[0].id;
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(concluirPosVenda(id, 'respondeu'))).toBe('/');
    await entrarComo('carlos@dcerutti.local');
    expect((await concluirPosVenda(id, 'respondeu')).erro).toBe('Contato não encontrado.');
    expect((await descadastrarDeOfertas(contatos[0].clienteId)).erro).toBe('Cliente não encontrada.');
    await entrarComo('ana@dcerutti.local');
    expect((await concluirPosVenda(id, 'inventado')).ok).toBe(false);
    expect((await concluirPosVenda(id, 'nao_respondeu')).ok).toBe(true);
    await concluirPosVenda(id, 'respondeu');
    expect((await db.posVendaContato.findUniqueOrThrow({ where: { id } })).resultado).toBe('nao_respondeu');
  });

  it('virou atendimento: abre o atendimento na carteira e leva até ele', async () => {
    const c = await clienteDaAna();
    const { contatos } = await venda(c);
    const url = await redirecionou(posVendaViraAtendimento(contatos[0].id));
    const a = await db.atendimento.findFirstOrThrow({ where: { clienteId: c.id } });
    expect(url).toBe(`/painel/atendimento/${a.id}`);
    expect(a.responsavelId).toBe(c.vendedorId);
    expect((await db.posVendaContato.findUniqueOrThrow({ where: { id: contatos[0].id } })).resultado).toBe('virou_atendimento');
  });
});

describe('pagamento e entrega', () => {
  it('só quem cuida do pedido, com valores válidos e não em cancelado', async () => {
    const c = await clienteDaAna();
    const { v } = await produtoDeTeste();
    const p = await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    const envio = (o: Record<string, string> = {}) => salvarSituacaoDoPedido(vazio, form({ id: p.id, pagamento: 'pago', entrega: 'enviado', ...o }));
    esperarErroDeCampo(await envio({ pagamento: 'fiado' }), 'pagamento');
    expect((await envio()).ok).toBe(true);
    expect(await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ pagamentoSituacao: 'pago', entregaSituacao: 'enviado', status: 'pendente' });
    await entrarComo('carlos@dcerutti.local');
    expect((await envio({ pagamento: 'aguardando' })).erro).toBe('Pedido não encontrado.');
    await cancelarPedido(p.id, 'equipe');
    await entrarComo('ana@dcerutti.local');
    expect((await envio()).erro).toMatch(/cancelado/);
  });
});

describe('consentimento', () => {
  it('na ficha: marcar, desmarcar e marcar de novo', async () => {
    const c = await clienteDaAna();
    const base = { id: c.id, nome: c.nome, telefone: c.telefone };
    const ver = () => db.cliente.findUniqueOrThrow({ where: { id: c.id } });
    await salvarCliente(vazio, form({ ...base, aceitaOfertas: true }));
    const aceito = await ver();
    expect(aceito.aceitaOfertasEm).not.toBeNull();
    await salvarCliente(vazio, form(base));
    expect((await ver()).descadastradaEm).not.toBeNull();
    await salvarCliente(vazio, form({ ...base, aceitaOfertas: true }));
    expect((await ver()).descadastradaEm).toBeNull();
  });

  it('em Minha conta, a própria cliente sai; excluir a conta apaga os contatos', async () => {
    const email = `oferta.${Date.now()}@exemplo.com`;
    const tel = celular();
    const conta = await criarConta(db, { nome: 'Oferta Conta', email, senha: 'senha-teste-1', papel: 'cliente' });
    const c = await clienteDaAna({ nome: 'Oferta Conta', telefone: tel, userId: conta.id, aceitaOfertasEm: new Date() });
    await venda(c);
    await entrarComo(email);
    expect((await atualizarMeusDados(vazio, form({ nome: 'Oferta Conta', telefone: tel }))).ok).toBe(true);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).descadastradaEm).not.toBeNull();
    expect((await excluirMinhaConta()).ok).toBe(true);
    expect(await db.posVendaContato.count({ where: { clienteId: c.id } })).toBe(0);
    expect(await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ aceitaOfertasEm: null, descadastradaEm: null });
  });

  it('formulário público: passa para a ficha nova, nunca altera ficha existente', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const { ref, v } = await produtoDeTeste();
    const chave = chaveDaPeca(ref, ana.id);
    const tel = celular();
    await entrarComo(null);
    expect((await registrarInteresse(chave, { varianteId: v.P, nome: 'Com Oferta', telefone: tel, aceite: true, ofertas: true })).ok).toBe(true);
    const a = await db.atendimento.findFirstOrThrow({ where: { contatoTelefone: tel } });
    expect(a.aceitouOfertasEm).not.toBeNull();
    await entrarComo('ana@dcerutti.local');
    await salvarContato(vazio, form({ id: a.id, telefone: tel }));
    const nova = await db.atendimento.findUniqueOrThrow({ where: { id: a.id }, include: { cliente: true } });
    expect(nova.cliente?.aceitaOfertasEm).not.toBeNull();

    const existente = await clienteDaAna({ aceitaOfertasEm: new Date(), descadastradaEm: new Date() });
    await entrarComo(null);
    estado.ip = '10.7.200.1';
    await registrarInteresse(chave, { varianteId: v.P, nome: 'Tentou Mudar', telefone: existente.telefone, aceite: true, ofertas: true });
    const depois = await db.cliente.findUniqueOrThrow({ where: { id: existente.id } });
    expect(depois.descadastradaEm).not.toBeNull();
    expect(depois.nome).toBe(existente.nome);
    const registro = await db.atendimentoRegistro.findFirstOrThrow({ where: { atendimento: { clienteId: existente.id } } });
    expect(registro.texto).toContain('confira com ela');
  });
});

describe('indicadores', () => {
  it('conversão, canal, motivo, tempo e recompra; só o gestor', async () => {
    const eu = await comoUsuario('ana@dcerutti.local');
    await expect(indicadoresAtendimento(eu, null)).rejects.toThrow('restrita ao gestor');
    const gestor = await comoUsuario('gestor@dcerutti.local');
    const antes = await indicadoresAtendimento(gestor, null);
    const criadoEm = new Date(Date.now() - 60 * 60_000);
    const base = { responsavelId: eu.id, criadoEm };
    await db.atendimento.createMany({ data: [
      { ...base, codigo: `AT-I1${Date.now() % 1e8}`, canal: 'outro', etapa: 'ganho', primeiroContatoEm: new Date(criadoEm.getTime() + 30 * 60_000), fechadoEm: new Date() },
      { ...base, codigo: `AT-I2${Date.now() % 1e8}`, canal: 'outro', etapa: 'perdido', motivoPerda: 'frete', primeiroContatoEm: new Date(criadoEm.getTime() + 30 * 60_000), fechadoEm: new Date() },
    ] });
    const d = await indicadoresAtendimento(gestor, null);
    expect(d.criados).toBe(antes.criados + 2);
    expect(d.ganhos).toBe(antes.ganhos + 1);
    expect(d.motivos.find(m => m.motivo === 'frete')?.n).toBe((antes.motivos.find(m => m.motivo === 'frete')?.n ?? 0) + 1);
    const canal = d.porCanal.find(c => c.canal === 'outro')!;
    expect(canal.criados).toBeGreaterThanOrEqual(2);
    expect(d.minutosPrimeiroContato).toBeGreaterThanOrEqual(0);
    // Contato antes da criação não entra na média nem deixa o tempo negativo.
    await db.atendimento.create({ data: { ...base, codigo: `AT-I3${Date.now() % 1e8}`, canal: 'outro', primeiroContatoEm: new Date(criadoEm.getTime() - 86_400_000 * 30) } });
    expect((await indicadoresAtendimento(gestor, null)).minutosPrimeiroContato).toBeGreaterThanOrEqual(0);
    const linha = (await visaoDaEquipe(gestor)).linhas.find(l => l.id === eu.id)!;
    expect(linha.criados).toBeGreaterThanOrEqual(2);

    const c = await clienteDaAna();
    const primeira = await venda(c);
    await concluirPosVenda(primeira.contatos[0].id, 'respondeu');
    await new Promise(r => setTimeout(r, 5));
    await venda(c);
    const r = (await indicadoresAtendimento(gestor, null)).posVenda;
    expect(r.feitos).toBeGreaterThanOrEqual(1);
    expect(r.voltaram).toBeGreaterThanOrEqual(1);
    expect(r.voltaram).toBeLessThanOrEqual(r.clientes);
  });
});
