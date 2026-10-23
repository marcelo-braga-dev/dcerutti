/** Server Actions de pedidos (cliente e equipe) e da conta da cliente (cadastro, dados, LGPD, exclusão, login). */
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelar, cancelarMeuPedido, conferirSacola, confirmar, criarSelecao, editarItens, enviarPedido, buscarPecas } from '@/server/acoes/pedidos';
import { aceitarPrivacidade, atualizarMeusDados, cadastrarCliente, entrar, excluirMinhaConta, pedirRedefinicao, redefinirSenha, sair } from '@/server/acoes/conta';
import { salvarConfig } from '@/server/config';
import { auth } from '@/server/auth';
import { criarPedido } from '@/server/pedidos';
import { clientePorEmail, clientePorNome, db, entrarComo, esperarErroDeCampo, estado, form, produtoDeTeste, redirecionou, usuarioPorEmail, variante } from './suporte/ajuda';
import { depoisDaResposta } from './suporte/next';

const vazio = {};
let seq = 0;
const email = () => `cad.${Date.now()}.${seq++}@exemplo.com`;
const tel = () => `(49) 97${String(100 + (seq++ % 900)).padStart(3, '0')}-${String(Date.now() % 10000).padStart(4, '0')}`;

beforeEach(() => entrarComo(null));

describe('enviar pedido da sacola (cliente)', () => {
  it('só cliente envia; equipe é mandada para o painel', async () => {
    await entrarComo('ana@dcerutti.local');
    expect(await redirecionou(enviarPedido({ tipo: 'compra', linhas: [{ varianteId: 1, quantidade: 1 }] }))).toBe('/painel');
  });

  it('compra: grava, monta o WhatsApp do vendedor dela e avisa a equipe depois da resposta', async () => {
    await entrarComo('cliente@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 3 }, preco: 50 });
    const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.codigo).toMatch(/^PED-/);
    expect(r.destinatario).toBe('Ana');
    expect(r.url).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?phone=5549988904646&text=/);
    const texto = decodeURIComponent(r.url.split('text=')[1]);
    expect(texto).toMatch(/^(Bom dia|Boa tarde|Boa noite), Ana! 👋\nAqui é Mariana\./);
    expect(texto).toContain(`🛍️ *PEDIDO ${r.codigo}*`);
    expect(texto).toContain('👤 Mariana Souza');
    expect(texto).toContain('🚚 Frete: a combinar');
    expect(texto).toContain('📦 Pagamento e entrega: combinamos por aqui.');
    // O vendedor abre o pedido direto pelo link; o texto devolvido é o mesmo do link (botão "Copiar mensagem").
    const p0 = await db.pedido.findUniqueOrThrow({ where: { codigo: r.codigo } });
    expect(texto).toContain(`https://teste.dcerutti.local/painel/pedidos/${p0.id}`);
    expect(r.texto).toBe(texto);
    expect(r).toMatchObject({ total: 100, frete: null });
    expect(texto).not.toMatch(/Frete: R\$/); // sem regra de frete: nenhum valor, só "a combinar"
    const p = await db.pedido.findUniqueOrThrow({ where: { codigo: r.codigo } });
    expect(p).toMatchObject({ origem: 'loja', nomeCliente: 'Mariana Souza', frete: null });
    expect(estado.depois.length).toBeGreaterThan(0);
    await depoisDaResposta();
  });

  it('com regra de frete configurada, o frete é cobrado e aparece na mensagem', async () => {
    await salvarConfig({ frete: { valor: 20, gratisAcima: 1000 } });
    try {
      await entrarComo('cliente@dcerutti.local');
      const { v } = await produtoDeTeste({ estoque: { M: 3 }, preco: 50 });
      const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.M, quantidade: 1 }] });
      expect(r.ok && decodeURIComponent(r.url)).toMatch(/Frete: R\$\s20,00[\s\S]*\*Total: R\$\s70,00\*/);
      expect(Number((await db.pedido.findUniqueOrThrow({ where: { codigo: r.ok ? r.codigo : '' } })).frete)).toBe(20);
    } finally {
      await salvarConfig({ frete: null });
      await depoisDaResposta();
    }
  });

  it('condicional: exige CEP válido e atendido; fora da área sugere pedido; guarda o CEP na ficha', async () => {
    await entrarComo('cliente.fora@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    expect(await enviarPedido({ tipo: 'condicional', linhas: [{ varianteId: v.M, quantidade: 1 }], cep: '123' })).toEqual({ ok: false, erro: 'Digite um CEP válido com 8 números.' });
    expect(await enviarPedido({ tipo: 'condicional', linhas: [{ varianteId: v.M, quantidade: 1 }], cep: '89801-000' })).toEqual({ ok: false, erro: 'O condicional ainda não atende este CEP.', cepFora: true });
    await entrarComo('cliente.dados@dcerutti.local');
    // Estado de partida explícito: o teste roda igual mesmo repetido sem recriar o banco.
    const vera = await clientePorEmail('cliente.dados@dcerutti.local');
    await db.cliente.update({ where: { id: vera.id }, data: { cep: null } });
    const r = await enviarPedido({ tipo: 'condicional', linhas: [{ varianteId: v.M, quantidade: 1 }], cep: '89874001' });
    expect(r.ok).toBe(true);
    expect((await clientePorEmail('cliente.dados@dcerutti.local')).cep).toBe('89874-001');
    expect((await variante(v.M)).reservado).toBe(1);
    await depoisDaResposta();
  });

  it('vendedor com WhatsApp incompleto: o pedido vai para o WhatsApp da loja (RN-03)', async () => {
    await entrarComo('cliente.gustavo@dcerutti.local');
    const { v } = await produtoDeTeste();
    const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.P, quantidade: 1 }] });
    expect(r.ok && r.destinatario).toBe('a loja');
    expect(r.ok && r.url).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?phone=5549988036499&/);
    await depoisDaResposta();
  });

  it('entrada inválida e peça indisponível', async () => {
    await entrarComo('cliente@dcerutti.local');
    expect((await enviarPedido({ tipo: 'compra', linhas: [] })).ok).toBe(false);
    expect((await enviarPedido({ tipo: 'outro' as never, linhas: [{ varianteId: 1, quantidade: 1 }] })).ok).toBe(false);
    expect((await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: 1, quantidade: 21 }] })).ok).toBe(false);
    const { v } = await produtoDeTeste({ estoque: { M: 1 } });
    const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.M, quantidade: 2 }] });
    expect(!r.ok && r.erro).toMatch(/1 disponível/);
  });
});

describe('conferir sacola e buscar peças', () => {
  it('devolve preço e disponível atuais; null para o que saiu do catálogo', async () => {
    await entrarComo('cliente@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 4 }, preco: 77 });
    const { v: inativo } = await produtoDeTeste({ ativo: false });
    const r = await conferirSacola([v.M, inativo.P, 999_999_999, 1.5]);
    expect(r[v.M]).toEqual({ preco: 77, disponivel: 4 });
    expect(r[inativo.P]).toBeNull();
    expect(r[999_999_999]).toBeNull();
    expect(Object.keys(r)).toHaveLength(3);
  });

  it('buscar peças (equipe): só com estoque, até 12, por termo', async () => {
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(buscarPecas('x'))).toBe('/');
    await entrarComo('ana@dcerutti.local');
    const r = await buscarPecas('vestido');
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(12);
    expect(r.every(p => p.variantes.length > 0 && p.variantes.every(x => x.disponivel > 0))).toBe(true);
    expect(r.every(p => /vestido/i.test(`${p.nome} ${p.categoria}`))).toBe(true);
    expect((await buscarPecas('')).every(p => p.imagem)).toBe(true);
  });
});

describe('seleção do vendedor (pedido, condicional, venda na loja)', () => {
  it('vendedor monta para cliente dele; recusa cliente de outro', async () => {
    await entrarComo('carlos@dcerutti.local');
    const { v } = await produtoDeTeste();
    const juliana = await clientePorNome('Juliana Ferreira');
    expect(await criarSelecao({ clienteId: juliana.id, linhas: [{ varianteId: v.P, quantidade: 1 }] })).toEqual({ ok: false, erro: 'Escolha o cliente.' });
    const roberto = await clientePorNome('Roberto Lima');
    const r = await criarSelecao({ clienteId: roberto.id, linhas: [{ varianteId: v.P, quantidade: 1 }], tipo: 'condicional' });
    expect(r.ok).toBe(true);
    const p = await db.pedido.findUniqueOrThrow({ where: { id: r.pedidoId! } });
    expect(p).toMatchObject({ tipo: 'condicional', origem: 'vendedor', status: 'pendente', frete: null });
    expect((await variante(v.P)).reservado).toBe(1);
    expect(decodeURIComponent(r.ok ? r.url : '')).toContain('Carlos');
  });

  it('venda na loja (Q-04): entra confirmada, baixa estoque e cria a venda; dispensa WhatsApp válido', async () => {
    await entrarComo('ana@dcerutti.local');
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const c = await db.cliente.create({ data: { nome: 'Sem Zap Balcão', telefone: '(49) 9999', vendedorId: ana.id } });
    const { v } = await produtoDeTeste({ estoque: { P: 3 }, preco: 60 });
    expect((await criarSelecao({ clienteId: c.id, linhas: [{ varianteId: v.P, quantidade: 1 }] })).ok, 'pedido normal exige WhatsApp').toBe(false);
    const r = await criarSelecao({ clienteId: c.id, linhas: [{ varianteId: v.P, quantidade: 2 }], tipo: 'balcao' });
    expect(r.ok).toBe(true);
    const p = await db.pedido.findUniqueOrThrow({ where: { id: r.pedidoId! }, include: { venda: true } });
    expect(p).toMatchObject({ tipo: 'compra', origem: 'balcao', status: 'confirmado' });
    expect(p.venda?.observacao).toBe(`Venda na loja ${p.codigo}`);
    expect(Number(p.venda?.valor)).toBe(120);
    expect((await variante(v.P)).estoque).toBe(1);
  });

  it('gestor monta em nome do vendedor do cliente; sem peças é recusado', async () => {
    await entrarComo('gestor@dcerutti.local');
    const juliana = await clientePorNome('Juliana Ferreira');
    const { v } = await produtoDeTeste();
    const r = await criarSelecao({ clienteId: juliana.id, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: r.pedidoId! } })).vendedorId).toBe(juliana.vendedorId);
    expect(await criarSelecao({ clienteId: juliana.id, linhas: [] })).toEqual({ ok: false, erro: 'Adicione pelo menos uma peça.' });
  });
});

describe('confirmar, cancelar e editar pela equipe (escopo)', () => {
  async function pedidoDaAna() {
    const juliana = await clientePorNome('Juliana Ferreira');
    const { v } = await produtoDeTeste();
    return criarPedido({ tipo: 'compra', origem: 'loja', clienteId: juliana.id, vendedorId: juliana.vendedorId, nomeCliente: juliana.nome, telefoneCliente: juliana.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
  }

  it('vendedor de outro cliente recebe "não encontrado" e nada muda', async () => {
    const p = await pedidoDaAna();
    await entrarComo('carlos@dcerutti.local');
    expect(await confirmar(p.id, {})).toEqual({ ok: false, erro: 'Pedido não encontrado.' });
    expect(await cancelar(p.id, 'teste')).toEqual({ ok: false, erro: 'Pedido não encontrado.' });
    expect(await editarItens(p.id, { linhas: [] })).toEqual({ ok: false, erro: 'Pedido não encontrado.' });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('pendente');
  });

  it('dona confirma; cancelar depois desfaz a venda (D-17); de novo é recusado com mensagem', async () => {
    const p = await pedidoDaAna();
    await entrarComo('ana@dcerutti.local');
    expect(await confirmar(p.id, {})).toEqual({ ok: true });
    expect(await confirmar(p.id, {})).toEqual({ ok: false, erro: 'Este pedido já foi fechado.' });
    expect(await cancelar(p.id, 'teste')).toEqual({ ok: true });
    expect(await cancelar(p.id, 'teste')).toEqual({ ok: false, erro: 'Este pedido já foi cancelado.' });
  });

  it('gestor cancela qualquer um com motivo "equipe"; edição pela action', async () => {
    const p = await pedidoDaAna();
    await entrarComo('gestor@dcerutti.local');
    const [item] = await db.pedidoItem.findMany({ where: { pedidoId: p.id } });
    const r = await editarItens(p.id, { linhas: [{ itemId: item.id, varianteId: item.varianteId, quantidade: 2, preco: Number(item.precoUnitario) }], observacao: 'mais uma' });
    expect(r).toMatchObject({ ok: true, url: expect.stringContaining('api.whatsapp.com/send') });
    expect(decodeURIComponent(r.url!.split('text=')[1])).toContain('Atualizei o seu pedido');
    expect(await db.pedidoHistorico.findFirst({ where: { pedidoId: p.id, acao: 'editado' } })).toMatchObject({ autor: 'equipe', observacao: 'mais uma' });
    expect((await db.pedidoItem.findUniqueOrThrow({ where: { id: item.id } })).quantidade).toBe(2);
    expect(await cancelar(p.id, '  ')).toEqual({ ok: false, erro: 'Informe o motivo do cancelamento.' });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('pendente');
    expect(await cancelar(p.id, 'Cliente desistiu da compra')).toEqual({ ok: true });
    expect(await db.pedidoHistorico.findFirst({ where: { pedidoId: p.id, acao: 'cancelado' } })).toMatchObject({ autor: 'equipe', observacao: 'Cliente desistiu da compra' });
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).motivoCancelamento).toBe('equipe');
  });
});

describe('cancelar meu pedido (cliente, U-05)', () => {
  it('só a dona cancela; motivo "cliente"; avisa a equipe; pedido fechado não cancela', async () => {
    await entrarComo('cliente@dcerutti.local');
    const { v } = await produtoDeTeste();
    const r = await enviarPedido({ tipo: 'condicional', linhas: [{ varianteId: v.P, quantidade: 1 }], cep: '89874-000' });
    await depoisDaResposta();
    const p = await db.pedido.findUniqueOrThrow({ where: { codigo: r.ok ? r.codigo : '' } });
    await entrarComo('cliente.carlos@dcerutti.local');
    expect(await cancelarMeuPedido(p.id)).toEqual({ ok: false, erro: 'Pedido não encontrado.' });
    await entrarComo('cliente@dcerutti.local');
    expect(await cancelarMeuPedido(p.id)).toEqual({ ok: true });
    expect(await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: 'cancelado', motivoCancelamento: 'cliente' });
    expect((await variante(v.P)).reservado).toBe(0);
    expect(estado.depois.length).toBe(1);
    await depoisDaResposta();
    expect(await cancelarMeuPedido(p.id)).toEqual({ ok: false, erro: 'Este pedido já foi fechado.' });
  });
});

describe('conta da cliente', () => {
  it('atualizar meus dados: cadastro e ficha juntos; validações', async () => {
    await entrarComo('cliente.dados@dcerutti.local');
    expect(await atualizarMeusDados(vazio, form({ nome: 'Vera Dados Silva', telefone: '49999130007', endereco: 'Rua A, 1', cidade: 'Maravilha', cep: '89874000' }))).toEqual({ ok: true, mensagem: 'Dados atualizados.' });
    const u = await db.user.findUniqueOrThrow({ where: { email: 'cliente.dados@dcerutti.local' }, include: { cliente: true } });
    expect(u.name).toBe('Vera Dados Silva');
    expect(u.cliente).toMatchObject({ nome: 'Vera Dados Silva', telefone: '(49) 99913-0007', endereco: 'Rua A, 1', cep: '89874-000' });
    esperarErroDeCampo(await atualizarMeusDados(vazio, form({ nome: 'Ve', telefone: '49999130007' })), 'nome');
    esperarErroDeCampo(await atualizarMeusDados(vazio, form({ nome: 'Vera', telefone: '4999' })), 'telefone');
    esperarErroDeCampo(await atualizarMeusDados(vazio, form({ nome: 'Vera', telefone: '49999130007', cep: '1' })), 'cep');
    await entrarComo('ana@dcerutti.local');
    expect(await redirecionou(atualizarMeusDados(vazio, form({})))).toBe('/painel');
  });

  it('aceitar a política grava a data e volta para onde estava (só caminho interno)', async () => {
    const e = email();
    await entrarComo('gestor@dcerutti.local');
    const { criarConta } = await import('@/server/contas');
    await criarConta(db, { nome: 'Sem Aceite', email: e, senha: 'senha-cliente-1', papel: 'cliente' });
    await entrarComo(e);
    expect(await redirecionou(aceitarPrivacidade(vazio, form({ volta: '/produto/FIX-PROMO?x=1' })))).toBe('/produto/FIX-PROMO?x=1');
    expect((await usuarioPorEmail(e)).aceitouPrivacidadeEm).toBeInstanceOf(Date);
    expect(await redirecionou(aceitarPrivacidade(vazio, form({ volta: 'https://golpe.com' })))).toBe('/');
    expect(await redirecionou(aceitarPrivacidade(vazio, form({ volta: '//golpe.com' })))).toBe('/');
  });

  it('excluir minha conta: recusa com pedido pendente; senão anonimiza ficha e pedidos e apaga o acesso', async () => {
    await entrarComo('cliente.pendente@dcerutti.local');
    expect((await excluirMinhaConta()).erro).toMatch(/em aberto/);
    expect(await usuarioPorEmail('cliente.pendente@dcerutti.local')).toBeTruthy();

    const e = email();
    const { criarConta } = await import('@/server/contas');
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const u = await criarConta(db, { nome: 'Vai Excluir', email: e, senha: 'senha-cliente-1', papel: 'cliente', aceitouPrivacidadeEm: new Date() });
    const c = await db.cliente.create({ data: { userId: u.id, nome: 'Vai Excluir', telefone: tel(), email: e, cidade: 'X', cep: '89874-000', vendedorId: ana.id } });
    const { v } = await produtoDeTeste();
    const p = await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: ana.id, nomeCliente: c.nome, telefoneCliente: c.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    await db.pedido.update({ where: { id: p.id }, data: { status: 'cancelado', canceladoEm: new Date(), motivoCancelamento: 'cliente' } });
    await db.session.create({ data: { userId: u.id, token: `tok-x-${Date.now()}`, expiresAt: new Date(Date.now() + 864e5) } });
    await entrarComo(e);
    expect(await excluirMinhaConta()).toEqual({ ok: true });
    expect(await db.user.findUnique({ where: { email: e } })).toBeNull();
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.account.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ nome: 'Cliente removido', telefone: '', email: null, cidade: null, cep: null, userId: null });
    expect(await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ nomeCliente: 'Cliente removido', telefoneCliente: '', cep: null });
  });
});

describe('cadastro de cliente', () => {
  // O limite é de 5 cadastros por IP por hora: cada teste usa um IP próprio para não somar com os outros.
  let ip = 0;
  beforeEach(() => void (estado.ip = `192.0.2.${++ip}`));
  const dados = (o: Record<string, string | boolean> = {}) => form({ nome: 'Cliente Nova', telefone: tel(), email: email(), senha: 'senha-nova-1', aceite: true, ...o });

  it('cria conta com aceite, ficha com o vendedor do convite e entra (volta interna)', async () => {
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const fd = dados({ vendedorId: carlos.id, volta: '/sacola' });
    const e = String(fd.get('email'));
    expect(await redirecionou(cadastrarCliente(vazio, fd))).toBe('/sacola');
    const u = await db.user.findUniqueOrThrow({ where: { email: e }, include: { cliente: true } });
    expect(u.papel).toBe('cliente');
    expect(u.aceitouPrivacidadeEm).toBeInstanceOf(Date);
    expect(u.cliente!.vendedorId).toBe(carlos.id);
    expect(auth.api.signInEmail).toHaveBeenCalled();
  });

  it('sem convite: vendedor padrão das configurações; convite de inativo é ignorado', async () => {
    const ana = await usuarioPorEmail('ana@dcerutti.local');
    const fabio = await usuarioPorEmail('fabio@dcerutti.local');
    for (const fd of [dados(), dados({ vendedorId: fabio.id }), dados({ vendedorId: 'nao-existe' })]) {
      expect(await redirecionou(cadastrarCliente(vazio, fd))).toBe('/');
      expect((await clientePorEmail(String(fd.get('email')))).vendedorId).toBe(ana.id);
    }
  });

  it('WhatsApp de ficha já existente sem conta: fica com o mesmo vendedor, mas nunca liga as fichas (C-03)', async () => {
    const roberto = await clientePorNome('Roberto Lima');
    const fd = dados({ telefone: '49998112233' });
    await redirecionou(cadastrarCliente(vazio, fd));
    const nova = await clientePorEmail(String(fd.get('email')));
    expect(nova.vendedorId).toBe(roberto.vendedorId);
    expect(nova.id).not.toBe(roberto.id);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: roberto.id } })).userId).toBeNull();
  });

  it('validações: aceite obrigatório, e-mail já cadastrado, senha curta, telefone, nome', async () => {
    esperarErroDeCampo(await cadastrarCliente(vazio, dados({ aceite: false })), 'aceite', /política/);
    esperarErroDeCampo(await cadastrarCliente(vazio, dados({ email: 'CLIENTE@dcerutti.local' })), 'email', /já tem conta/);
    esperarErroDeCampo(await cadastrarCliente(vazio, dados({ senha: '1234567' })), 'senha');
    esperarErroDeCampo(await cadastrarCliente(vazio, dados({ telefone: '123' })), 'telefone');
    esperarErroDeCampo(await cadastrarCliente(vazio, dados({ nome: 'Al' })), 'nome');
  });

  it('limite: no máximo 5 cadastros por IP por hora', async () => {
    estado.ip = `198.51.100.${Date.now() % 200}`;
    for (let i = 0; i < 5; i++) expect(await redirecionou(cadastrarCliente(vazio, dados()))).toBe('/');
    const r = await cadastrarCliente(vazio, dados());
    expect(r.erro).toMatch(/Muitos cadastros/);
    estado.ip = '10.0.0.1';
  });
});

describe('entrar, sair e senha', () => {
  it('login certo vai para o destino do papel ou para a volta interna', async () => {
    expect(await redirecionou(entrar(vazio, form({ email: 'ANA@dcerutti.local', senha: 'qualquer' })))).toBe('/painel');
    expect(await redirecionou(entrar(vazio, form({ email: 'cliente@dcerutti.local', senha: 'x' })))).toBe('/');
    expect(await redirecionou(entrar(vazio, form({ email: 'cliente@dcerutti.local', senha: 'x', volta: '/produto/FIX-PROMO' })))).toBe('/produto/FIX-PROMO');
    expect(await redirecionou(entrar(vazio, form({ email: 'cliente@dcerutti.local', senha: 'x', volta: 'https://golpe.com' })))).toBe('/');
    expect(await entrar(vazio, form({ email: '', senha: '' }))).toMatchObject({ erro: 'Informe e-mail e senha.' });
  });

  it('senha errada: mensagem genérica; 5 erros bloqueiam o e-mail por 15 min', async () => {
    const falha = auth.api.signInEmail as unknown as { mockRejectedValue: (e: Error) => void; mockResolvedValue: (v: object) => void };
    falha.mockRejectedValue(new Error('invalid'));
    const e = `bloqueio.${Date.now()}@exemplo.com`;
    for (let i = 0; i < 5; i++) expect((await entrar(vazio, form({ email: e, senha: 'x' }))).erro).toBe('E-mail ou senha incorretos.');
    expect((await entrar(vazio, form({ email: e, senha: 'x' }))).erro).toMatch(/Muitas tentativas\. Tente de novo em 1[45] min\./);
    falha.mockResolvedValue({});
  });

  it('pedir redefinição: e-mail inválido recusado; válido responde igual exista ou não a conta', async () => {
    esperarErroDeCampo(await pedirRedefinicao(vazio, form({ email: 'x' })), 'email');
    const a = await pedirRedefinicao(vazio, form({ email: 'cliente@dcerutti.local' }));
    const b = await pedirRedefinicao(vazio, form({ email: 'ninguem@exemplo.com' }));
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  it('redefinir senha: confirmação igual, mínimo 8 e link válido', async () => {
    esperarErroDeCampo(await redefinirSenha(vazio, form({ token: 'token-longo-123', senha: 'senha-nova-1', confirmacao: 'outra-senha' })), 'confirmacao');
    esperarErroDeCampo(await redefinirSenha(vazio, form({ token: 'token-longo-123', senha: 'curta', confirmacao: 'curta' })), 'senha');
    esperarErroDeCampo(await redefinirSenha(vazio, form({ token: 'x', senha: 'senha-nova-1', confirmacao: 'senha-nova-1' })), 'token');
    expect(await redirecionou(redefinirSenha(vazio, form({ token: 'token-longo-123', senha: 'senha-nova-1', confirmacao: 'senha-nova-1' })))).toBe('/entrar?redefinida=1');
    (auth.api.resetPassword as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error('expirado'));
    expect((await redefinirSenha(vazio, form({ token: 'token-longo-123', senha: 'senha-nova-1', confirmacao: 'senha-nova-1' }))).erro).toMatch(/inválido ou já expirou/);
  });

  it('sair encerra a sessão e vai para /entrar', async () => {
    expect(await redirecionou(sair())).toBe('/entrar');
    expect(auth.api.signOut).toHaveBeenCalled();
  });
});
