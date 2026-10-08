/**
 * Server Actions da equipe (clientes, vendas manuais, vendedores, metas, configurações) com sessão simulada:
 * permissão por papel, validação de cada campo e o efeito no banco.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { excluirVenda, registrarVenda, salvarCliente } from '@/server/acoes/clientes';
import { desativarVendedor, reativarVendedor, salvarConfiguracoes, salvarMeta, salvarVendedor } from '@/server/acoes/gestao';
import { lerConfig, salvarConfig } from '@/server/config';
import { criarPedido } from '@/server/pedidos';
import { diaDe, mesDe } from '@/lib/datas';
import { clientePorNome, db, entrarComo, esperarErroDeCampo, estado, form, produtoDeTeste, redirecionou, usuarioPorEmail } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const tel = () => `(49) 98${String(1000000 + Date.now() % 1000000 + seq++).slice(-7, -4)}-${String(1000 + seq * 7).slice(-4)}`;
const email = () => `teste.${Date.now()}.${seq++}@exemplo.com`;

beforeEach(() => entrarComo(null));

describe('permissões das actions', () => {
  it('sem sessão vai para /entrar; cliente vai para a loja; vendedor nas de gestor vai para o painel', async () => {
    expect(await redirecionou(salvarCliente(vazio, form({})))).toBe('/entrar');
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(salvarCliente(vazio, form({})))).toBe('/');
    expect(await redirecionou(registrarVenda(vazio, form({})))).toBe('/');
    await entrarComo('ana@dcerutti.local');
    expect(await redirecionou(salvarVendedor(vazio, form({})))).toBe('/painel');
    expect(await redirecionou(salvarConfiguracoes(vazio, form({})))).toBe('/painel');
    expect(await redirecionou(salvarMeta(vazio, form({})))).toBe('/painel');
    expect(await redirecionou(desativarVendedor(vazio, form({})))).toBe('/painel');
    expect(await redirecionou(reativarVendedor('x'))).toBe('/painel');
  });
});

describe('salvar cliente', () => {
  it('vendedor cadastra para si (sem acesso à loja) e é levado à ficha', async () => {
    const ana = await entrarComo('ana@dcerutti.local');
    const t = tel();
    const destino = await redirecionou(salvarCliente(vazio, form({ nome: '  Cliente da Ana  ', telefone: t.replace(/\D/g, ''), cidade: 'Maravilha', cep: '89874000', email: '' })));
    const c = await db.cliente.findFirstOrThrow({ where: { telefone: t }, orderBy: { criadoEm: 'desc' } });
    expect(destino).toBe(`/painel/clientes/${c.id}`);
    expect(c).toMatchObject({ nome: 'Cliente da Ana', vendedorId: ana!.id, cep: '89874-000', userId: null, email: null });
  });

  it('vendedor não consegue escolher outro vendedor (ignorado)', async () => {
    const ana = await entrarComo('ana@dcerutti.local');
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const t = tel();
    await redirecionou(salvarCliente(vazio, form({ nome: 'Tentou Trocar', telefone: t, vendedorId: carlos.id })));
    expect((await db.cliente.findFirstOrThrow({ where: { telefone: t } })).vendedorId).toBe(ana!.id);
  });

  it('e-mail + senha criam acesso à loja; só e-mail fica como contato', async () => {
    await entrarComo('ana@dcerutti.local');
    const e1 = email(), e2 = email();
    await redirecionou(salvarCliente(vazio, form({ nome: 'Com Acesso', telefone: tel(), email: e1.toUpperCase(), senha: 'senha-cliente-1' })));
    const u = await db.user.findUniqueOrThrow({ where: { email: e1 }, include: { cliente: true } });
    expect(u.papel).toBe('cliente');
    expect(u.cliente!.email).toBe(e1);
    await redirecionou(salvarCliente(vazio, form({ nome: 'Só Contato', telefone: tel(), email: e2 })));
    expect(await db.user.findUnique({ where: { email: e2 } })).toBeNull();
    expect((await db.cliente.findFirstOrThrow({ where: { email: e2 } })).userId).toBeNull();
  });

  it('validações: nome, WhatsApp, e-mail, senha curta, CEP', async () => {
    await entrarComo('ana@dcerutti.local');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'A', telefone: tel() })), 'nome');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Fulana', telefone: '(49) 9999-999' })), 'telefone', /DDD e 9 dígitos/);
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Fulana', telefone: tel(), email: 'nao-e-email' })), 'email');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Fulana', telefone: tel(), email: email(), senha: '123' })), 'senha', /8 caracteres/);
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Fulana', telefone: tel(), cep: '8987' })), 'cep');
    const r = await salvarCliente(vazio, form({ nome: 'Fulana', telefone: 'abc', senha: 'x' }));
    expect(r.valores?.nome, 'devolve o que foi digitado').toBe('Fulana');
    expect(r.valores?.senha, 'nunca devolve a senha').toBeUndefined();
  });

  it('e-mail já usado por outra conta é recusado', async () => {
    await entrarComo('ana@dcerutti.local');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Copia', telefone: tel(), email: 'carlos@dcerutti.local' })), 'email', /em uso/);
  });

  it('gestor precisa escolher um vendedor ativo (nunca gestor nem inativo, Q-08)', async () => {
    await entrarComo('gestor@dcerutti.local');
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    const fabio = await usuarioPorEmail('fabio@dcerutti.local');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Sem Vendedor', telefone: tel() })), 'vendedorId');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Do Gestor', telefone: tel(), vendedorId: gestor.id })), 'vendedorId');
    esperarErroDeCampo(await salvarCliente(vazio, form({ nome: 'Do Inativo', telefone: tel(), vendedorId: fabio.id })), 'vendedorId');
    const beatriz = await usuarioPorEmail('beatriz@dcerutti.local');
    const t = tel();
    await redirecionou(salvarCliente(vazio, form({ nome: 'Da Beatriz', telefone: t, vendedorId: beatriz.id })));
    expect((await db.cliente.findFirstOrThrow({ where: { telefone: t } })).vendedorId).toBe(beatriz.id);
  });

  it('vendedor não edita cliente de outro vendedor', async () => {
    await entrarComo('carlos@dcerutti.local');
    const juliana = await clientePorNome('Juliana Ferreira');
    const r = await salvarCliente(vazio, form({ id: juliana.id, nome: 'Invadido', telefone: juliana.telefone }));
    expect(r.erro).toBe('Cliente não encontrado.');
    expect((await db.cliente.findUniqueOrThrow({ where: { id: juliana.id } })).nome).toBe('Juliana Ferreira');
  });

  it('cliente com conta: vendedor não troca e-mail nem senha; gestor troca e encerra as sessões', async () => {
    const vera = await db.cliente.findFirstOrThrow({ where: { user: { email: 'cliente.dados@dcerutti.local' } }, include: { user: true } });
    await entrarComo('diego@dcerutti.local');
    const base = { id: vera.id, nome: vera.nome, telefone: vera.telefone, email: vera.email! };
    esperarErroDeCampo(await salvarCliente(vazio, form({ ...base, email: 'outro@exemplo.com' })), 'email', /Só o gestor/);
    esperarErroDeCampo(await salvarCliente(vazio, form({ ...base, senha: 'senha-nova-123' })), 'senha', /Só o gestor/);
    esperarErroDeCampo(await salvarCliente(vazio, form({ ...base, email: '' })), 'email');
    expect((await salvarCliente(vazio, form({ ...base, preferencias: 'Saias · Tam. 38' }))).ok).toBe(true);

    await db.session.create({ data: { userId: vera.userId!, token: `tok-vera-${Date.now()}`, expiresAt: new Date(Date.now() + 864e5) } });
    await entrarComo('gestor@dcerutti.local');
    const r = await salvarCliente(vazio, form({ ...base, vendedorId: vera.vendedorId, senha: 'senha-nova-123' }));
    expect(r).toMatchObject({ ok: true, mensagem: 'Cliente salvo.' });
    expect(await db.session.count({ where: { userId: vera.userId! } })).toBe(0);
  });

  it('trocar o vendedor do cliente leva os pedidos pendentes junto (B-09), não os fechados', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const elisa = await usuarioPorEmail('elisa@dcerutti.local');
    await entrarComo('ana@dcerutti.local');
    const t = tel();
    await redirecionou(salvarCliente(vazio, form({ nome: 'Vai Trocar', telefone: t })));
    const c = await db.cliente.findFirstOrThrow({ where: { telefone: t } });
    const { v } = await produtoDeTeste();
    const mk = () => criarPedido({ tipo: 'compra', origem: 'vendedor', clienteId: c.id, vendedorId: ana.id, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    const aberto = await mk();
    const fechado = await mk();
    await db.pedido.update({ where: { id: fechado.id }, data: { status: 'cancelado', canceladoEm: new Date(), motivoCancelamento: 'equipe' } });
    await entrarComo('gestor@dcerutti.local');
    expect((await salvarCliente(vazio, form({ id: c.id, nome: c.nome, telefone: c.telefone, vendedorId: elisa.id }))).ok).toBe(true);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: aberto.id } })).vendedorId).toBe(elisa.id);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: fechado.id } })).vendedorId).toBe(ana.id);
  });
});

describe('venda manual', () => {
  it('registra com o valor em formato brasileiro, para o vendedor de quem lançou', async () => {
    const carlos = await entrarComo('carlos@dcerutti.local');
    const roberto = await clientePorNome('Roberto Lima');
    expect(await registrarVenda(vazio, form({ clienteId: roberto.id, valor: '1.259,70', data: diaDe() }))).toEqual({ ok: true, mensagem: 'Venda registrada.' });
    const v = await db.venda.findFirstOrThrow({ where: { clienteId: roberto.id }, orderBy: { criadoEm: 'desc' } });
    expect(Number(v.valor)).toBe(1259.7);
    expect(v).toMatchObject({ vendedorId: carlos!.id, observacao: 'Venda na loja', custo: null, pedidoId: null });
    expect(estado.revalidados).toContain('/painel');
  });

  it('gestor lança em nome do vendedor do cliente', async () => {
    await entrarComo('gestor@dcerutti.local');
    const juliana = await clientePorNome('Juliana Ferreira');
    await registrarVenda(vazio, form({ clienteId: juliana.id, valor: '99', data: diaDe(), observacao: 'Pix' }));
    const v = await db.venda.findFirstOrThrow({ where: { clienteId: juliana.id, observacao: 'Pix' } });
    expect(v.vendedorId).toBe(juliana.vendedorId);
  });

  it('validações: valor, data no futuro, formato da data, cliente de outro vendedor', async () => {
    await entrarComo('carlos@dcerutti.local');
    const roberto = await clientePorNome('Roberto Lima');
    esperarErroDeCampo(await registrarVenda(vazio, form({ clienteId: roberto.id, valor: '0', data: diaDe() })), 'valor');
    esperarErroDeCampo(await registrarVenda(vazio, form({ clienteId: roberto.id, valor: 'abc', data: diaDe() })), 'valor');
    const amanha = diaDe(new Date(Date.now() + 2 * 864e5));
    esperarErroDeCampo(await registrarVenda(vazio, form({ clienteId: roberto.id, valor: '10', data: amanha })), 'data', /futuro/);
    esperarErroDeCampo(await registrarVenda(vazio, form({ clienteId: roberto.id, valor: '10', data: '07/10/2026' })), 'data');
    const juliana = await clientePorNome('Juliana Ferreira');
    expect((await registrarVenda(vazio, form({ clienteId: juliana.id, valor: '10', data: diaDe() }))).erro).toBe('Cliente não encontrado.');
  });

  it('excluir: só venda manual, só no escopo', async () => {
    await entrarComo('carlos@dcerutti.local');
    const roberto = await clientePorNome('Roberto Lima');
    await registrarVenda(vazio, form({ clienteId: roberto.id, valor: '10', data: diaDe(), observacao: 'para excluir' }));
    const manual = await db.venda.findFirstOrThrow({ where: { observacao: 'para excluir' } });
    await entrarComo('ana@dcerutti.local');
    expect(await excluirVenda(manual.id)).toEqual({ ok: false, erro: 'Venda não encontrada.' });
    await entrarComo('carlos@dcerutti.local');
    expect(await excluirVenda(manual.id)).toEqual({ ok: true });
    expect(await db.venda.findUnique({ where: { id: manual.id } })).toBeNull();
    await entrarComo('gestor@dcerutti.local');
    const dePedido = await db.venda.findFirstOrThrow({ where: { NOT: { pedidoId: null } } });
    expect(await excluirVenda(dePedido.id)).toEqual({ ok: false, erro: 'Venda de pedido não se exclui por aqui.' });
    expect(await excluirVenda('nao-existe')).toEqual({ ok: false, erro: 'Venda não encontrada.' });
  });
});

describe('vendedores e metas (gestor)', () => {
  beforeEach(() => entrarComo('gestor@dcerutti.local'));

  it('cria vendedor com meta do mês; meta em branco = 0 (U-10)', async () => {
    const e = email();
    const destino = await redirecionou(salvarVendedor(vazio, form({ nome: 'Novo Vendedor', telefone: tel(), email: e, senha: 'senha-vend-1', meta: '' })));
    const u = await db.user.findUniqueOrThrow({ where: { email: e }, include: { metas: true } });
    expect(destino).toBe(`/painel/vendedores/${u.id}`);
    expect(u.papel).toBe('vendedor');
    expect(u.metas.map(m => [m.mes, Number(m.valor)])).toEqual([[mesDe(), 0]]);
    expect((await salvarVendedor(vazio, form({ id: u.id, nome: 'Novo Vendedor', telefone: u.telefone!, email: e, meta: '15.000' }))).ok).toBe(true);
    expect(Number((await db.meta.findFirstOrThrow({ where: { vendedorId: u.id } })).valor)).toBe(15000);
  });

  it('validações: senha obrigatória na criação, senha curta, e-mail em uso, meta negativa, nome', async () => {
    esperarErroDeCampo(await salvarVendedor(vazio, form({ nome: 'Sem Senha', telefone: tel(), email: email(), meta: '1' })), 'senha');
    esperarErroDeCampo(await salvarVendedor(vazio, form({ nome: 'Senha Curta', telefone: tel(), email: email(), senha: '1234567', meta: '1' })), 'senha');
    esperarErroDeCampo(await salvarVendedor(vazio, form({ nome: 'Repetido', telefone: tel(), email: 'ana@dcerutti.local', senha: 'senha-vend-1', meta: '1' })), 'email', /em uso/);
    esperarErroDeCampo(await salvarVendedor(vazio, form({ nome: 'Meta Ruim', telefone: tel(), email: email(), senha: 'senha-vend-1', meta: '-5' })), 'meta');
    esperarErroDeCampo(await salvarVendedor(vazio, form({ nome: 'Ab', telefone: tel(), email: email(), senha: 'senha-vend-1', meta: '1' })), 'nome');
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    expect((await salvarVendedor(vazio, form({ id: gestor.id, nome: 'Virar Vendedor', telefone: tel(), email: gestor.email, meta: '1' }))).erro).toBe('Vendedor não encontrado.');
  });

  it('desativar: exige destino; transfere clientes e pendentes; encerra sessões; reativar volta', async () => {
    const e = email();
    await redirecionou(salvarVendedor(vazio, form({ nome: 'Vai Sair', telefone: tel(), email: e, senha: 'senha-vend-1', meta: '' })));
    const sai = await usuarioPorEmail(e);
    const fica = await usuarioPorEmail('beatriz@dcerutti.local');
    const c = await db.cliente.create({ data: { nome: 'Cliente de Quem Sai', telefone: tel(), vendedorId: sai.id } });
    const { v } = await produtoDeTeste();
    const p = await criarPedido({ tipo: 'compra', origem: 'vendedor', clienteId: c.id, vendedorId: sai.id, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    await db.session.create({ data: { userId: sai.id, token: `tok-sai-${Date.now()}`, expiresAt: new Date(Date.now() + 864e5) } });

    esperarErroDeCampo(await desativarVendedor(vazio, form({ id: sai.id })), 'transferirPara');
    esperarErroDeCampo(await desativarVendedor(vazio, form({ id: sai.id, transferirPara: sai.id })), 'transferirPara');
    const r = await desativarVendedor(vazio, form({ id: sai.id, transferirPara: fica.id }));
    expect(r).toEqual({ ok: true, mensagem: 'Vendedor desativado. 1 cliente transferido.' });
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).vendedorId).toBe(fica.id);
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).vendedorId).toBe(fica.id);
    expect((await usuarioPorEmail(e)).ativo).toBe(false);
    expect(await db.session.count({ where: { userId: sai.id } })).toBe(0);

    expect(await reativarVendedor(sai.id)).toEqual({ ok: true });
    expect((await usuarioPorEmail(e)).ativo).toBe(true);
    expect(await reativarVendedor('nao-existe')).toEqual({ ok: false, erro: 'Vendedor não encontrado.' });
  });

  it('não desativa a si mesmo nem outro gestor', async () => {
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    const sup = await usuarioPorEmail('supervisora@dcerutti.local');
    expect((await desativarVendedor(vazio, form({ id: gestor.id }))).erro).toBe('Vendedor não encontrado.');
    expect((await desativarVendedor(vazio, form({ id: sup.id }))).erro).toBe('Vendedor não encontrado.');
    expect((await usuarioPorEmail('supervisora@dcerutti.local')).ativo).toBe(true);
    expect(await reativarVendedor(sup.id)).toEqual({ ok: false, erro: 'Vendedor não encontrado.' });
  });

  it('vendedor sem clientes nem pendentes sai sem escolher destino', async () => {
    const e = email();
    await redirecionou(salvarVendedor(vazio, form({ nome: 'Sem Nada', telefone: tel(), email: e, senha: 'senha-vend-1', meta: '' })));
    const u = await usuarioPorEmail(e);
    expect(await desativarVendedor(vazio, form({ id: u.id }))).toEqual({ ok: true, mensagem: 'Vendedor desativado.' });
  });

  it('meta por mês: grava, atualiza e valida', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    expect(await salvarMeta(vazio, form({ vendedorId: ana.id, mes: '2030-01', valor: '12.500,50' }))).toEqual({ ok: true, mensagem: 'Meta salva.' });
    expect(Number((await db.meta.findUniqueOrThrow({ where: { vendedorId_mes: { vendedorId: ana.id, mes: '2030-01' } } })).valor)).toBe(12500.5);
    await salvarMeta(vazio, form({ vendedorId: ana.id, mes: '2030-01', valor: '100' }));
    expect(await db.meta.count({ where: { vendedorId: ana.id, mes: '2030-01' } })).toBe(1);
    esperarErroDeCampo(await salvarMeta(vazio, form({ vendedorId: ana.id, mes: '01/2030', valor: '1' })), 'mes');
    esperarErroDeCampo(await salvarMeta(vazio, form({ vendedorId: ana.id, mes: '2030-02', valor: 'x' })), 'valor');
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    expect((await salvarMeta(vazio, form({ vendedorId: gestor.id, mes: '2030-01', valor: '1' }))).erro).toBe('Vendedor não encontrado.');
  });
});

describe('configurações (gestor)', () => {
  beforeEach(() => entrarComo('gestor@dcerutti.local'));
  const base = { whatsappLoja: '(49) 98803-6499', cepsCondicional: '89874-000', cidadeCondicional: 'Maravilha/SC', parcelas: '0', diasExpiracao: '7' };
  const restaurar = () => salvarConfig({ frete: null, parcelas: 0, diasExpiracao: 7, cepsCondicional: ['89874-000', '89874-001'], whatsappLoja: '49988036499', catalogoPublico: false });

  it('sem "cobrar frete" o frete fica a combinar; com, grava valor e mínimo', async () => {
    expect(await salvarConfiguracoes(vazio, form({ ...base, freteValor: '30' }))).toEqual({ ok: true, mensagem: 'Configurações salvas.' });
    expect((await lerConfig()).frete).toBeNull();
    await salvarConfiguracoes(vazio, form({ ...base, cobrarFrete: true, freteValor: '24,90', freteGratisAcima: '299' }));
    expect((await lerConfig()).frete).toEqual({ valor: 24.9, gratisAcima: 299 });
    await salvarConfiguracoes(vazio, form({ ...base, cobrarFrete: true, freteValor: '15', freteGratisAcima: '' }));
    expect((await lerConfig()).frete).toEqual({ valor: 15, gratisAcima: 0 });
    await restaurar();
  });

  it('CEPs: aceita vários separadores e formata; recusa CEP incompleto', async () => {
    await salvarConfiguracoes(vazio, form({ ...base, cepsCondicional: '89874000, 89874-001;89875000\n89876-000' }));
    expect((await lerConfig()).cepsCondicional).toEqual(['89874-000', '89874-001', '89875-000', '89876-000']);
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, cepsCondicional: '89874-000, 8987' })), 'cepsCondicional');
    await restaurar();
  });

  it('validações: WhatsApp, cidade, parcelas, prazo de expiração, frete sem valor', async () => {
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, whatsappLoja: '123' })), 'whatsappLoja');
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, cidadeCondicional: ' ' })), 'cidadeCondicional');
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, parcelas: '13' })), 'parcelas');
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, diasExpiracao: '91' })), 'diasExpiracao');
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, diasExpiracao: '-1' })), 'diasExpiracao');
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, diasExpiracao: '2.5' })), 'diasExpiracao');
    esperarErroDeCampo(await salvarConfiguracoes(vazio, form({ ...base, cobrarFrete: true, freteValor: '' })), 'freteValor');
    expect((await lerConfig()).diasExpiracao, 'nada foi gravado').toBe(7);
  });

  it('WhatsApp gravado só com dígitos; catálogo público e vendedor padrão', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    await salvarConfiguracoes(vazio, form({ ...base, catalogoPublico: true, vendedorPadraoId: ana.id }));
    expect(await lerConfig()).toMatchObject({ whatsappLoja: '49988036499', catalogoPublico: true, vendedorPadraoId: ana.id });
    await restaurar();
  });
});
