/**
 * Atendimento online (docs/26): escopo, regra da carteira (D-30), contato sem ficha, conversão em pedido e o que o
 * pedido devolve ao atendimento.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adiarAtendimento, apagarDadosDoContato, apagarResposta, criarPedidoDoAtendimento, gravarResposta, incluirPeca, marcarContato, novoAtendimento, passarAtendimento, retirarPeca, salvarContato, salvarEtapa, salvarNota } from '@/server/acoes/atendimento';
import { desativarVendedor } from '@/server/acoes/gestao';
import { excluirMinhaConta } from '@/server/acoes/conta';
import { contarFila, detalheDoAtendimento, filaDeHoje, listarAtendimentos, visaoDaEquipe } from '@/server/consultas/atendimento';
import { limparAtendimentos, MESES_RETENCAO_ATENDIMENTO } from '@/server/atendimento-pedido';
import { salvarConfig } from '@/server/config';
import { cancelarPedido, confirmarPedido, desfazerVenda } from '@/server/pedidos';
import { criarConta } from '@/server/contas';
import { diaDe } from '@/lib/datas';
import { comoUsuario, db, entrarComo, esperarErroDeCampo, form, produtoDeTeste, redirecionou, usuarioPorEmail } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const celular = () => { const d = String(Date.now() + seq++).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };
const usuarioIg = () => `teste.${Date.now().toString(36)}${seq++}`;
const amanha = () => diaDe(new Date(Date.now() + 86_400_000));

/** Cria e devolve o atendimento pelo redirect. */
async function criar(campos: Record<string, string>) {
  const url = await redirecionou(novoAtendimento(vazio, form({ canal: 'whatsapp', ...campos })));
  const id = url.split('/').at(-1)!;
  return db.atendimento.findUniqueOrThrow({ where: { id }, include: { itens: true } });
}

beforeEach(() => entrarComo('ana@dcerutti.local'));

describe('permissões e escopo', () => {
  it('sem sessão e cliente não entram; vendedora não passa nem apaga', async () => {
    await entrarComo(null);
    expect(await redirecionou(novoAtendimento(vazio, form({})))).toBe('/entrar');
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(novoAtendimento(vazio, form({})))).toBe('/');
    await entrarComo('ana@dcerutti.local');
    expect(await redirecionou(passarAtendimento(vazio, form({ id: 'x', para: 'y' })))).toBe('/painel');
    expect(await redirecionou(apagarDadosDoContato('x'))).toBe('/painel');
  });

  it('vendedora só vê e altera os dela; gestor vê tudo', async () => {
    const a = await criar({ nome: 'Da Ana', telefone: celular() });
    const ana = await comoUsuario('ana@dcerutti.local'), carlos = await comoUsuario('carlos@dcerutti.local'), gestor = await comoUsuario('gestor@dcerutti.local');
    expect(await detalheDoAtendimento(ana, a.id)).not.toBeNull();
    expect(await detalheDoAtendimento(gestor, a.id)).not.toBeNull();
    expect(await detalheDoAtendimento(carlos, a.id)).toBeNull();
    expect((await listarAtendimentos(carlos, { pagina: 1, q: a.codigo })).total).toBe(0);
    expect((await filaDeHoje(carlos)).novos.some(x => x.id === a.id)).toBe(false);
    await expect(visaoDaEquipe(ana)).rejects.toThrow('restrita ao gestor');

    await entrarComo('carlos@dcerutti.local');
    expect((await marcarContato(a.id, 'whatsapp')).erro).toBe('Atendimento não encontrado.');
    expect((await adiarAtendimento(a.id)).erro).toBe('Atendimento não encontrado.');
    expect((await salvarNota(vazio, form({ id: a.id, texto: 'Invasão' }))).erro).toBe('Atendimento não encontrado.');
    expect((await criarPedidoDoAtendimento(a.id, 'compra')).erro).toBe('Atendimento não encontrado.');
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: a.id } })).toBe(0);
  });
});

describe('novo atendimento', () => {
  it('valida e exige um contato', async () => {
    esperarErroDeCampo(await novoAtendimento(vazio, form({ nome: 'A', telefone: celular(), canal: 'whatsapp' })), 'nome');
    esperarErroDeCampo(await novoAtendimento(vazio, form({ nome: 'Sem Contato', canal: 'whatsapp' })), 'telefone', /WhatsApp ou o @/);
    esperarErroDeCampo(await novoAtendimento(vazio, form({ nome: 'Fulana', telefone: '123', canal: 'whatsapp' })), 'telefone');
    esperarErroDeCampo(await novoAtendimento(vazio, form({ nome: 'Fulana', instagram: 'com espaço', canal: 'instagram' })), 'instagram');
    esperarErroDeCampo(await novoAtendimento(vazio, form({ nome: 'Fulana', telefone: celular(), canal: 'pombo' })), 'canal');
  });

  it('com WhatsApp nasce a ficha, na carteira de quem registrou', async () => {
    const t = celular(), ig = usuarioIg();
    const a = await criar({ nome: 'Cliente Nova', telefone: t, instagram: `@${ig}`, canal: 'instagram', nota: 'Quer vestido' });
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    expect(a.responsavelId).toBe(ana.id);
    const c = await db.cliente.findUniqueOrThrow({ where: { id: a.clienteId! } });
    expect(c).toMatchObject({ nome: 'Cliente Nova', telefone: t, instagram: ig, origem: 'instagram', vendedorId: ana.id });
    expect(a.contatoNome).toBeNull();
    expect(await db.atendimentoRegistro.findFirst({ where: { atendimentoId: a.id, tipo: 'nota' } })).toMatchObject({ texto: 'Quer vestido' });
  });

  it('só com @ não cria ficha; ao receber o WhatsApp, a ficha nasce', async () => {
    const ig = usuarioIg();
    const a = await criar({ nome: 'Só Direct', instagram: ig, canal: 'instagram' });
    expect(a).toMatchObject({ clienteId: null, contatoNome: 'Só Direct', contatoInstagram: ig });
    const t = celular();
    expect((await salvarContato(vazio, form({ id: a.id, telefone: t }))).ok).toBe(true);
    const depois = await db.atendimento.findUniqueOrThrow({ where: { id: a.id }, include: { cliente: true } });
    expect(depois.cliente).toMatchObject({ telefone: t, instagram: ig, nome: 'Só Direct' });
    expect(depois.contatoNome).toBeNull();
  });

  it('dois registros ao mesmo tempo do mesmo WhatsApp: uma ficha e um atendimento', async () => {
    const t = celular();
    const r = await Promise.allSettled([novoAtendimento(vazio, form({ nome: 'Corrida', telefone: t, canal: 'whatsapp' })), novoAtendimento(vazio, form({ nome: 'Corrida', telefone: t, canal: 'whatsapp' }))]);
    expect(r).toHaveLength(2);
    const fichas = await db.cliente.findMany({ where: { telefone: t } });
    expect(fichas).toHaveLength(1);
    expect(await db.atendimento.count({ where: { clienteId: fichas[0].id } })).toBe(1);
  });

  it('contato de outra carteira vai para a dona, sem mostrar a ficha (D-30)', async () => {
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const ficha = await db.cliente.create({ data: { nome: 'Cliente do Carlos Secreta', telefone: celular(), email: 'nao.mostrar@exemplo.com', vendedorId: carlos.id } });
    const r = await novoAtendimento(vazio, form({ nome: 'Digitado pela Ana', telefone: ficha.telefone, canal: 'whatsapp', nota: 'Ligou na loja' }));
    expect(r.ok).toBe(true);
    expect(r.mensagem).toContain('Carlos');
    expect(JSON.stringify(r)).not.toMatch(/Secreta|nao\.mostrar/);
    const a = await db.atendimento.findFirstOrThrow({ where: { clienteId: ficha.id } });
    expect(a.responsavelId).toBe(carlos.id);
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: a.id, tipo: 'nota' } })).toBe(1);
    // A ficha não muda, e o nome digitado não a substitui.
    expect((await db.cliente.findUniqueOrThrow({ where: { id: ficha.id } })).nome).toBe('Cliente do Carlos Secreta');
    expect(await detalheDoAtendimento(await comoUsuario('ana@dcerutti.local'), a.id)).toBeNull();
  });

  it('já há conversa aberta: junta a nota e não abre outra', async () => {
    const t = celular();
    const a = await criar({ nome: 'Repetida', telefone: t });
    const url = await redirecionou(novoAtendimento(vazio, form({ nome: 'Repetida', telefone: t, canal: 'whatsapp', nota: 'Voltou a chamar' })));
    expect(url).toBe(`/painel/atendimento/${a.id}`);
    expect(await db.atendimento.count({ where: { clienteId: a.clienteId } })).toBe(1);
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: a.id, tipo: 'nota' } })).toBe(1);
  });

  it('WhatsApp informado depois, de ficha de outra carteira: o atendimento vai para a dona', async () => {
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const ficha = await db.cliente.create({ data: { nome: 'Do Carlos', telefone: celular(), vendedorId: carlos.id } });
    const a = await criar({ nome: 'Direct', instagram: usuarioIg(), canal: 'instagram' });
    expect(await redirecionou(salvarContato(vazio, form({ id: a.id, telefone: ficha.telefone })))).toBe('/painel/atendimento');
    expect(await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ clienteId: ficha.id, responsavelId: carlos.id, contatoNome: null });
  });

  it('gestor sem escolher vai para a padrão; sem padrão, fica sem responsável, sem ficha, e dá para passar', async () => {
    await entrarComo('gestor@dcerutti.local');
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const antes = await db.configuracao.findUnique({ where: { chave: 'vendedorPadraoId' } });
    await salvarConfig({ vendedorPadraoId: '' });
    const t = celular();
    const a = await criar({ nome: 'Da Fila', telefone: t });
    expect(a).toMatchObject({ responsavelId: null, clienteId: null, contatoTelefone: t });
    expect((await visaoDaEquipe(await comoUsuario('gestor@dcerutti.local'))).semResponsavel.some(x => x.id === a.id)).toBe(true);
    expect((await passarAtendimento(vazio, form({ id: a.id, para: carlos.id }))).ok).toBe(true);
    const depois = await db.atendimento.findUniqueOrThrow({ where: { id: a.id }, include: { cliente: true } });
    expect(depois.responsavelId).toBe(carlos.id);
    expect(depois.cliente).toMatchObject({ telefone: t, vendedorId: carlos.id });
    expect((await passarAtendimento(vazio, form({ id: a.id, para: carlos.id }))).ok).not.toBe(true);
    expect((await passarAtendimento(vazio, form({ id: a.id, para: (await usuarioPorEmail('fabio@dcerutti.local')).id }))).ok).not.toBe(true);
    await salvarConfig({ vendedorPadraoId: String(antes?.valor ?? '') });
  });
});

describe('etapas e fila', () => {
  it('conversa aberta exige data; perder exige motivo; etapa do pedido não é manual', async () => {
    const a = await criar({ nome: 'Etapas', telefone: celular() });
    esperarErroDeCampo(await salvarEtapa(vazio, form({ id: a.id, etapa: 'em_conversa' })), 'proximoContato');
    esperarErroDeCampo(await salvarEtapa(vazio, form({ id: a.id, etapa: 'em_conversa', proximoContato: '2020-01-01' })), 'proximoContato', /passado/);
    esperarErroDeCampo(await salvarEtapa(vazio, form({ id: a.id, etapa: 'perdido' })), 'motivoPerda');
    expect((await salvarEtapa(vazio, form({ id: a.id, etapa: 'ganho', proximoContato: amanha() }))).erro).toMatch(/pedido/);
    expect((await salvarEtapa(vazio, form({ id: a.id, etapa: 'proposta', proximoContato: amanha() }))).ok).toBe(true);
    expect((await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).etapa).toBe('proposta');
    expect((await salvarEtapa(vazio, form({ id: a.id, etapa: 'perdido', motivoPerda: 'preco', proximoContato: '2020-01-01' }))).ok).toBe(true);
    const perdido = await db.atendimento.findUniqueOrThrow({ where: { id: a.id } });
    expect(perdido).toMatchObject({ etapa: 'perdido', motivoPerda: 'preco', proximoContatoEm: null });
    expect(perdido.fechadoEm).not.toBeNull();
    expect((await salvarEtapa(vazio, form({ id: a.id, etapa: 'em_conversa', proximoContato: amanha() }))).ok).toBe(true);
    expect((await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).fechadoEm).toBeNull();
  });

  it('a fila: novo sai depois do contato, retorno entra na data, e o número do menu acompanha', async () => {
    const eu = await comoUsuario('ana@dcerutti.local');
    const a = await criar({ nome: 'Na Fila', telefone: celular() });
    const antes = await contarFila(eu);
    expect((await filaDeHoje(eu)).novos.some(x => x.id === a.id)).toBe(true);
    expect((await marcarContato(a.id, 'whatsapp')).ok).toBe(true);
    const depois = await db.atendimento.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois.etapa).toBe('em_conversa');
    expect(depois.primeiroContatoEm).not.toBeNull();
    expect(depois.proximoContatoEm!.getTime()).toBeGreaterThan(Date.now());
    let fila = await filaDeHoje(eu);
    expect(fila.novos.some(x => x.id === a.id)).toBe(false);
    expect(await contarFila(eu)).toBe(antes - 1);

    await db.atendimento.update({ where: { id: a.id }, data: { proximoContatoEm: new Date(Date.now() - 3600_000) } });
    fila = await filaDeHoje(eu);
    expect(fila.retornos.some(x => x.id === a.id)).toBe(true);
    expect((await adiarAtendimento(a.id, 2)).ok).toBe(true);
    expect((await filaDeHoje(eu)).retornos.some(x => x.id === a.id)).toBe(false);
  });

  it('primeiro contato não muda em cliques seguintes; cada clique fica no histórico', async () => {
    const a = await criar({ nome: 'Cliques', telefone: celular() });
    await marcarContato(a.id, 'whatsapp');
    const primeiro = (await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).primeiroContatoEm;
    await marcarContato(a.id, 'instagram');
    expect((await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).primeiroContatoEm).toEqual(primeiro);
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: a.id, tipo: { in: ['contato_whatsapp', 'contato_direct'] } } })).toBe(2);
  });
});

describe('peças e pedido', () => {
  it('sem ficha ou sem peças não vira pedido', async () => {
    const semFicha = await criar({ nome: 'Sem Zap', instagram: usuarioIg(), canal: 'instagram' });
    const { v } = await produtoDeTeste();
    expect((await incluirPeca(semFicha.id, v.P)).ok).toBe(true);
    expect((await criarPedidoDoAtendimento(semFicha.id, 'compra')).erro).toMatch(/WhatsApp/);
    const semPeca = await criar({ nome: 'Sem Peça', telefone: celular() });
    expect((await criarPedidoDoAtendimento(semPeca.id, 'compra')).erro).toMatch(/peça/);
    expect((await incluirPeca(semPeca.id, 99_999_999)).ok).toBe(false);
  });

  it('dois cliques ao mesmo tempo criam um pedido só, e a venda fica com a carteira', async () => {
    const a = await criar({ nome: 'Clique Duplo', telefone: celular() });
    const { v } = await produtoDeTeste();
    await incluirPeca(a.id, v.P);
    await incluirPeca(a.id, v.P);
    await incluirPeca(a.id, v.M);
    const item = await db.atendimentoItem.findFirstOrThrow({ where: { atendimentoId: a.id, varianteId: v.M } });
    await retirarPeca(a.id, item.id);
    const r = await Promise.all([criarPedidoDoAtendimento(a.id, 'compra'), criarPedidoDoAtendimento(a.id, 'compra')]);
    expect(r.filter(x => x.ok)).toHaveLength(1);
    expect(await db.pedido.count({ where: { clienteId: a.clienteId! } })).toBe(1);
    const p = await db.pedido.findFirstOrThrow({ where: { clienteId: a.clienteId! }, include: { itens: true } });
    expect(p.itens).toHaveLength(1);
    expect(p.itens[0].quantidade).toBe(2);
    expect(p.vendedorId).toBe((await usuarioPorEmail('ana@dcerutti.local')).id);
    const depois = await db.atendimento.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois).toMatchObject({ pedidoId: p.id, etapa: 'aguardando_pagamento' });
    expect((await salvarEtapa(vazio, form({ id: a.id, etapa: 'perdido', motivoPerda: 'preco' }))).erro).toMatch(/pedido em aberto/);
    expect((await incluirPeca(a.id, v.G)).ok).toBe(false);
    expect(r.find(x => x.ok)!.url).toContain('api.whatsapp.com');
  });

  it('peça sem estoque: o pedido não sai e o atendimento não muda', async () => {
    const a = await criar({ nome: 'Sem Estoque', telefone: celular() });
    const { v } = await produtoDeTeste({ estoque: { P: 1 } });
    await incluirPeca(a.id, v.P);
    await incluirPeca(a.id, v.P);
    expect((await criarPedidoDoAtendimento(a.id, 'compra')).ok).toBe(false);
    expect(await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ pedidoId: null, etapa: 'novo' });
  });

  it('o pedido define a etapa: confirmado vira Vendido; desfeito ou cancelado volta e pode gerar outro', async () => {
    const eu = await usuarioPorEmail('ana@dcerutti.local');
    const a = await criar({ nome: 'Ciclo Completo', telefone: celular() });
    const { v } = await produtoDeTeste();
    await incluirPeca(a.id, v.P);
    const r = await criarPedidoDoAtendimento(a.id, 'compra');
    await confirmarPedido(r.pedidoId!, {}, eu.id);
    let at = await db.atendimento.findUniqueOrThrow({ where: { id: a.id } });
    expect(at.etapa).toBe('ganho');
    expect(at.fechadoEm).not.toBeNull();
    expect((await salvarEtapa(vazio, form({ id: a.id, etapa: 'perdido', motivoPerda: 'preco' }))).erro).toMatch(/venda/);

    await desfazerVenda(r.pedidoId!, eu.id, 'Devolveu');
    at = await db.atendimento.findUniqueOrThrow({ where: { id: a.id } });
    expect(at).toMatchObject({ etapa: 'em_conversa', pedidoId: null, fechadoEm: null });
    expect(at.proximoContatoEm).not.toBeNull();

    const r2 = await criarPedidoDoAtendimento(a.id, 'compra');
    expect(r2.ok).toBe(true);
    await cancelarPedido(r2.pedidoId!, 'equipe', eu.id, 'Desistiu');
    expect(await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ etapa: 'em_conversa', pedidoId: null });
  });

  it('condicional devolvido inteiro não é venda', async () => {
    const eu = await usuarioPorEmail('ana@dcerutti.local');
    const a = await criar({ nome: 'Devolveu Tudo', telefone: celular() });
    const { v } = await produtoDeTeste();
    await incluirPeca(a.id, v.P);
    const r = await criarPedidoDoAtendimento(a.id, 'condicional');
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: r.pedidoId! } });
    await confirmarPedido(r.pedidoId!, { [item.id]: 0 }, eu.id);
    expect((await db.atendimento.findUniqueOrThrow({ where: { id: a.id } })).etapa).toBe('em_conversa');
  });
});

describe('equipe e privacidade', () => {
  it('desativar a vendedora: os abertos vão com a carteira; sem carteira, vão para a fila do gestor', async () => {
    const nova = await criarConta(db, { nome: 'Vai Sair', email: `sai.${Date.now()}@exemplo.com`, senha: 'senha-teste-1', papel: 'vendedor' });
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const so = await db.atendimento.create({ data: { codigo: `AT-T${Date.now() % 1e9}`, canal: 'instagram', contatoNome: 'Só Direct', contatoInstagram: usuarioIg(), responsavelId: nova.id } });
    await entrarComo('gestor@dcerutti.local');
    expect((await desativarVendedor(vazio, form({ id: nova.id }))).ok).toBe(true);
    expect((await db.atendimento.findUniqueOrThrow({ where: { id: so.id } })).responsavelId).toBeNull();

    const outra = await criarConta(db, { nome: 'Vai Sair 2', email: `sai2.${Date.now()}@exemplo.com`, senha: 'senha-teste-1', papel: 'vendedor' });
    const c = await db.cliente.create({ data: { nome: 'Da que sai', telefone: celular(), vendedorId: outra.id } });
    const comFicha = await db.atendimento.create({ data: { codigo: `AT-U${Date.now() % 1e9}`, canal: 'whatsapp', clienteId: c.id, responsavelId: outra.id } });
    expect((await desativarVendedor(vazio, form({ id: outra.id, transferirPara: carlos.id }))).ok).toBe(true);
    expect((await db.atendimento.findUniqueOrThrow({ where: { id: comFicha.id } })).responsavelId).toBe(carlos.id);
  });

  it('excluir a conta apaga notas, peças, contato e o @', async () => {
    const email = `lgpd.${Date.now()}@exemplo.com`;
    const conta = await criarConta(db, { nome: 'LGPD', email, senha: 'senha-teste-1', papel: 'cliente' });
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const c = await db.cliente.create({ data: { nome: 'LGPD', telefone: celular(), instagram: usuarioIg(), userId: conta.id, vendedorId: ana.id } });
    const a = await db.atendimento.create({ data: { codigo: `AT-L${Date.now() % 1e9}`, canal: 'whatsapp', clienteId: c.id, responsavelId: ana.id, registros: { create: { tipo: 'nota', texto: 'Dado pessoal' } } } });
    await entrarComo(email);
    expect((await excluirMinhaConta()).ok).toBe(true);
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: a.id } })).toBe(0);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).instagram).toBeNull();
  });

  it('gestor apaga o contato sem ficha, a pedido da pessoa; com ficha, não', async () => {
    const semFicha = await criar({ nome: 'Pede Exclusão', instagram: usuarioIg(), canal: 'instagram' });
    const comFicha = await criar({ nome: 'Com Ficha', telefone: celular() });
    await entrarComo('gestor@dcerutti.local');
    expect((await apagarDadosDoContato(comFicha.id)).ok).toBe(false);
    expect((await apagarDadosDoContato(semFicha.id)).ok).toBe(true);
    expect(await db.atendimento.findUnique({ where: { id: semFicha.id } })).toBeNull();
  });

  it('retenção: encerrado sem ficha sai depois de 12 meses; com ficha e aberto ficam', async () => {
    const antigo = new Date();
    antigo.setMonth(antigo.getMonth() - MESES_RETENCAO_ATENDIMENTO - 1);
    const base = { canal: 'instagram' as const, contatoNome: 'Antigo' };
    const sai = await db.atendimento.create({ data: { ...base, codigo: `AT-R${Date.now() % 1e9}`, fechadoEm: antigo } });
    const aberto = await db.atendimento.create({ data: { ...base, codigo: `AT-S${Date.now() % 1e9}` } });
    await limparAtendimentos();
    expect(await db.atendimento.findUnique({ where: { id: sai.id } })).toBeNull();
    expect(await db.atendimento.findUnique({ where: { id: aberto.id } })).not.toBeNull();
  });
});

describe('respostas prontas', () => {
  it('vendedora cria só a dela; a da loja é do gestor; variável errada é recusada', async () => {
    const titulo = `Minha ${Date.now()}`;
    esperarErroDeCampo(await gravarResposta(vazio, form({ titulo, texto: 'Oi {nmoe}' })), 'texto', /nmoe/);
    expect((await gravarResposta(vazio, form({ titulo, texto: 'Oi {nome}' }))).ok).toBe(true);
    const r = await db.respostaPronta.findFirstOrThrow({ where: { titulo } });
    expect(r.usuarioId).toBe((await usuarioPorEmail('ana@dcerutti.local')).id);
    expect((await gravarResposta(vazio, form({ titulo: 'Da loja', texto: 'x y', daLoja: true }))).ok).not.toBe(true);
    const daLoja = await db.respostaPronta.findFirstOrThrow({ where: { usuarioId: null } });
    expect((await gravarResposta(vazio, form({ id: daLoja.id, titulo: 'Invadiu', texto: 'x y' }))).ok).not.toBe(true);
    expect((await apagarResposta(daLoja.id)).ok).toBe(false);
    await entrarComo('carlos@dcerutti.local');
    expect((await apagarResposta(r.id)).ok).toBe(false);
    const carlos = await comoUsuario('carlos@dcerutti.local');
    expect((await db.respostaPronta.findMany({ where: { OR: [{ usuarioId: null }, { usuarioId: carlos.id }] } })).some(x => x.id === r.id)).toBe(false);
    await entrarComo('ana@dcerutti.local');
    expect((await apagarResposta(r.id)).ok).toBe(true);
  });
});
