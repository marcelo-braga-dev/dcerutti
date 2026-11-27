/**
 * Seed de demonstração: o seed completo (semear) com mais volume e, por cima, todas as tabelas que ele deixa vazias ou
 * quase vazias (cupons, caixa com pagamentos, pagamento online, sugestões, atendimentos, vitrines, pós-venda, histórico
 * de navegação, acompanhamento da equipe, notificações, vídeos, importações...). Serve para ver o sistema "como em uso".
 *
 * Onde mexe em estoque, totais ou situação de pedido, usa as regras do próprio sistema (criarPedido com cupom e preço
 * combinado, confirmar, cancelar, editar, desfazer venda, sugestões, pós-venda). Registros de histórico (navegação,
 * ações da equipe, notificações, sessões) são gravados direto, espalhados pelos últimos meses.
 *
 * APAGA o banco inteiro antes (via semear). Só roda em banco local com SEED_PERMITIDO=1 ou nome test_*.
 */
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { Prisma, type AcaoEquipe, type CanalAtendimento, type EtapaAtendimento, type FormaPagamento, type PrismaClient, type StatusCobranca, type TipoNotificacao } from '@prisma/client';
import { criarConta } from '../../src/server/contas';
import { cancelarPedido, confirmarPedido, criarPedido, desfazerVenda, editarPedido, type MotivoCancelamento } from '../../src/server/pedidos';
import { movimentar } from '../../src/server/estoque';
import { catalogo, invalidarCatalogo } from '../../src/server/catalogo';
import { cancelarSugestao, criarSugestao, registrarVista, responderSugestao, salvarEscolhas, type EscolhaItem } from '../../src/server/sugestoes';
import { programarPosVenda } from '../../src/server/atendimento-pedido';
import { DIR_ARQUIVOS, PREFIXO_URL } from '../../src/server/arquivos';
import { PAGAMENTO_ONLINE_PADRAO } from '../../src/server/config';
import { MOTIVOS_PERDA } from '../../src/lib/atendimento';
import { RESULTADOS_POS_VENDA } from '../../src/lib/pos-venda';
import { formatarTelefone } from '../../src/lib/telefone';
import type { Usuario } from '../../src/lib/escopo';
import { gerador, semear } from './semear';
import * as F from './fixtures';

const DIA = 864e5;
const HORA = 36e5;
const run = promisify(execFile);
const r2 = (n: number) => Math.round(n * 100) / 100;
const APARELHOS = ['celular', 'celular', 'celular', 'computador', 'computador', 'tablet'] as const;

/** CPF válido (dígitos verificadores) a partir de um número de 9 dígitos. */
function cpf(n: number) {
  const d = String(n % 1e9).padStart(9, '0').split('').map(Number);
  if (new Set(d).size === 1) d[8] = (d[8] + 1) % 10;
  for (let k = 0; k < 2; k++) {
    const s = d.reduce((a, x, i) => a + x * (d.length + 1 - i), 0);
    const resto = (s * 10) % 11;
    d.push(resto === 10 ? 0 : resto);
  }
  const t = d.join('');
  return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`;
}

type R = ReturnType<typeof gerador>;
type Destino = 'confirmado' | 'cancelado' | 'pendente';

/** Fecha o pedido recém-criado pelas regras do sistema e leva as datas para `quando` (como em semear). */
async function fechar(db: PrismaClient, r: R, p: { id: string; tipo: string }, destino: Destino, quando: Date, usuarioId: string, clienteUserId: string | null = null, tudo = false) {
  if (destino === 'confirmado') {
    const itens = await db.pedidoItem.findMany({ where: { pedidoId: p.id } });
    const ficaram = Object.fromEntries(itens.map(it => [it.id, p.tipo === 'condicional' && !tudo ? r.inteiro(0, it.quantidade) : it.quantidade]));
    await confirmarPedido(p.id, ficaram, usuarioId);
    const fechado = new Date(Math.min(Date.now() - 60_000, quando.getTime() + r.inteiro(1, 48) * HORA));
    await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando, confirmadoEm: fechado } });
    await db.venda.updateMany({ where: { pedidoId: p.id }, data: { data: fechado, criadoEm: fechado } });
    await db.movimentoEstoque.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: fechado } });
    await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: fechado } });
    await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id, acao: 'criado' }, data: { criadoEm: quando } });
    return fechado;
  }
  if (destino === 'cancelado') {
    const motivo = r.escolher<MotivoCancelamento>(['equipe', 'cliente', 'expirado']);
    await cancelarPedido(p.id, motivo, motivo === 'cliente' ? clienteUserId : motivo === 'equipe' ? usuarioId : null);
    const cancelado = new Date(Math.min(Date.now() - 60_000, quando.getTime() + r.inteiro(1, 7) * DIA));
    await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando, canceladoEm: cancelado } });
    await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: cancelado } });
    await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id, acao: 'criado' }, data: { criadoEm: quando } });
    return cancelado;
  }
  await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando } });
  await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: quando } });
  return quando;
}

export async function semearDemo(db: PrismaClient, opcoes: { senha: string; log?: (m: string) => void }) {
  const log = opcoes.log ?? (() => {});
  const { ids, clienteIds } = await semear(db, { ...opcoes, quantidades: { clientesSemConta: 360, pedidos: 650, vendasManuais: 420 } });
  const r = gerador(4242);
  const agora = Date.now();
  const antes = (dias: number, horas = 0) => new Date(agora - dias * DIA - horas * HORA);
  const depois = (dias: number, horas = 0) => new Date(agora + dias * DIA + horas * HORA);
  const contagemDemo: Record<string, number> = {};
  const conta = (k: string, n = 1) => (contagemDemo[k] = (contagemDemo[k] ?? 0) + n);

  // ---------- Configurações: tudo ligado, para cada parte do sistema aparecer ----------
  const config: Record<string, Prisma.InputJsonValue> = {
    frete: { valor: 24.9, gratisAcima: 299 },
    parcelas: 6,
    cupons: { ligados: true, vendedorAplica: true },
    proximaCompra: { minimoParaGerar: 180, diasParaComecar: 2, diasValidade: 60, geraComCupom: false, acumula: false },
    historico: { ligado: true, avisarSacola: true, horasSacola: 24 },
    atendimento: { ligado: true, diasPosVenda: { entrega: 3, satisfacao: 10, sugestao: 30, reativacao: 90 } },
    vitrines: { ligadas: true },
    instagramLoja: 'dcerutti_',
    caixa: { descontoMaxVendedor: 10, parcelasMax: 6 },
    pagamentoOnline: { ...PAGAMENTO_ONLINE_PADRAO, ligado: true, pagarNaSacola: true, parcelasSemJuros: 3 },
    fornecedores: {
      'HERING DO BRASIL': { marca: 'Hering', ignorar: false },
      'DZARM CONFECCOES': { marca: 'Dzarm', ignorar: false },
      'BRINDES E EMBALAGENS': { marca: 'Outros', ignorar: true },
    },
  };
  for (const [chave, valor] of Object.entries(config)) await db.configuracao.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
  log('configurações ligadas (cupons, atendimento, vitrines, pagamento online, frete)');

  // ---------- Contas de teste fáceis de lembrar (só para este ambiente) ----------
  const SENHA_TESTE = 'San.1020';
  const gestorTeste = await criarConta(db, { nome: 'Gestor Teste', email: 'gestor@teste.com', senha: SENHA_TESTE, papel: 'gestor', telefone: '(49) 99950-1020' });
  const vendTeste = await criarConta(db, { nome: 'Vendedor Teste', email: 'vendedor@teste.com', senha: SENHA_TESTE, papel: 'vendedor', telefone: '(49) 99951-1020' });
  await db.user.updateMany({ where: { id: { in: [gestorTeste.id, vendTeste.id] } }, data: { emailVerified: true, createdAt: antes(180) } });
  const numTeste = await db.numeroWhatsApp.create({ data: { telefone: '49999511020', apelido: 'Linha Vendedor Teste', criadoPorId: ids.gestor, criadoEm: antes(170) } });
  await db.vinculoNumero.create({ data: { numeroId: numTeste.id, usuarioId: vendTeste.id, conexao: 'conectado', inicioEm: antes(170), conectadoEm: antes(170), vinculadoPorId: ids.gestor } });
  await db.user.update({ where: { id: vendTeste.id }, data: { numeroPrincipalId: numTeste.id } });
  const mesHoje = new Date(agora);
  await db.meta.createMany({ data: Array.from({ length: 7 }, (_, k) => { const d = new Date(mesHoje.getFullYear(), mesHoje.getMonth() - k, 1); return { vendedorId: vendTeste.id, mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, valor: 9000 + k * 500 }; }) });
  await db.cliente.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      vendedorId: vendTeste.id, nome: `${F.NOMES[(i * 3 + 1) % F.NOMES.length]} ${F.SOBRENOMES[(i * 5 + 2) % F.SOBRENOMES.length]}`,
      telefone: formatarTelefone(`4999${String(5200000 + i * 731).slice(0, 7)}`), cidade: r.escolher(F.CIDADES), criadoEm: antes(r.inteiro(5, 175)),
      cep: i % 2 ? F.CEPS_CONDICIONAL[0] : null, preferencias: i % 3 ? null : 'Blusas · Tam. M',
    })),
  });
  const userCliTeste = await criarConta(db, { nome: 'Cliente Teste', email: 'cliente@teste.com', senha: SENHA_TESTE, papel: 'cliente', telefone: '(49) 99952-1020', aceitouPrivacidadeEm: antes(90) });
  await db.cliente.create({ data: { userId: userCliTeste.id, vendedorId: vendTeste.id, nome: 'Cliente Teste', telefone: '(49) 99952-1020', email: 'cliente@teste.com', cidade: 'Maravilha', cep: F.CEPS_CONDICIONAL[0], endereco: 'Rua Teste, 1020', criadoEm: antes(90), aceitaOfertasEm: antes(90) } });
  log('contas de teste: gestor@teste.com, vendedor@teste.com, cliente@teste.com (senha San.1020)');

  // ---------- Equipe: objetos de usuário para as regras que pedem quem faz ----------
  const equipe = await db.user.findMany({ where: { papel: { in: ['vendedor', 'gestor'] } } });
  const usuario = (id: string): Usuario => {
    const u = equipe.find(x => x.id === id)!;
    return { id: u.id, name: u.name, email: u.email, papel: u.papel, telefone: u.telefone, aceitouPrivacidadeEm: u.aceitouPrivacidadeEm };
  };
  const vendedoras = equipe.filter(u => u.papel === 'vendedor' && u.ativo);
  const padrao = await db.numeroWhatsApp.findFirstOrThrow({ where: { padrao: true } });
  const numeroDe = new Map(equipe.map(u => [u.id, u.numeroPrincipalId ?? padrao.id]));

  // Respostas prontas pessoais.
  await db.respostaPronta.createMany({
    data: vendedoras.flatMap((v, k) => [
      { usuarioId: v.id, titulo: 'Bom dia!', texto: `Bom dia! Aqui é a ${v.name.split(' ')[0]} da D’Cerutti 😊 Chegaram novidades no seu tamanho, quer que eu te mande?`, ordem: 0 },
      { usuarioId: v.id, titulo: 'Condicional', texto: 'Posso separar um condicional para você provar em casa, sem compromisso. Qual o melhor dia para entregar?', ordem: 1 },
      ...(k % 2 ? [{ usuarioId: v.id, titulo: 'Pós-venda', texto: 'Oi! Gostou das peças? Se precisar trocar algum tamanho é só me avisar.', ordem: 2 }] : []),
    ]),
  });

  // Números: um vínculo encerrado e já desconectado, e uma linha nova aguardando conexão.
  const reserva = await db.numeroWhatsApp.findFirstOrThrow({ where: { apelido: 'Reserva' } });
  await db.vinculoNumero.create({ data: { numeroId: reserva.id, usuarioId: ids.carlos, conexao: 'conectado', inicioEm: antes(150), conectadoEm: antes(150), fimEm: antes(100), desconectadoEm: antes(99), motivoFim: 'Troca de aparelho', vinculadoPorId: ids.gestor, encerradoPorId: ids.gestor } });
  const live = await db.numeroWhatsApp.create({ data: { telefone: '49999060606', apelido: 'Linha das lives', observacao: 'Chip novo para as lives de sexta', criadoPorId: ids.gestor } });
  await db.vinculoNumero.create({ data: { numeroId: live.id, usuarioId: ids.supervisora, conexao: 'aguardando', inicioEm: antes(1), vinculadoPorId: ids.gestor } });

  // ---------- Clientes com conta na loja (para histórico, favoritos e sacola) e dados extras nas fichas ----------
  const novasComConta: { id: string; userId: string; vendedorId: string; nome: string }[] = [];
  for (let i = 0; i < 45; i++) {
    const nome = `${F.NOMES[(i * 5) % 23]} ${F.SOBRENOMES[(i * 11 + 3) % F.SOBRENOMES.length]}`;
    const telefone = formatarTelefone(`4998${String(7100000 + i * 911).slice(0, 7)}`);
    const email = `demo.cliente${String(i + 1).padStart(2, '0')}@dcerutti.local`;
    const criado = antes(r.inteiro(2, 170));
    const u = await criarConta(db, { nome, email, senha: opcoes.senha, papel: 'cliente', telefone, aceitouPrivacidadeEm: criado });
    await db.user.update({ where: { id: u.id }, data: { createdAt: criado, emailVerified: r.chance(0.6) } });
    const vendedorId = vendedoras[i % vendedoras.length].id;
    const cidade = r.escolher(F.CIDADES);
    const cli = await db.cliente.create({
      data: {
        userId: u.id, vendedorId, nome, telefone, email, criadoEm: criado, cidade,
        cep: cidade === 'Maravilha' ? r.escolher(F.CEPS_CONDICIONAL) : r.chance(0.5) ? '89900-000' : null,
        endereco: r.chance(0.7) ? `Rua ${r.escolher(F.SOBRENOMES)}, ${r.inteiro(10, 999)}` : null,
        cpf: r.chance(0.5) ? cpf(123456789 + i * 7919) : null,
        preferencias: r.chance(0.6) ? `${r.escolher(['Vestidos', 'Blusas', 'Calças', 'Moletons', 'Pijamas'])} · Tam. ${r.escolher(['P', 'M', 'G'])}` : null,
        instagram: r.chance(0.5) ? nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.') : null,
        origem: r.escolher<CanalAtendimento>(['instagram', 'whatsapp', 'loja', 'indicacao', 'link_peca', 'vitrine']),
        aceitaOfertasEm: r.chance(0.7) ? criado : null,
      },
    });
    novasComConta.push({ id: cli.id, userId: u.id, vendedorId, nome });
  }
  // Fichas antigas: Instagram, origem, CPF, consentimento de ofertas e algumas descadastradas.
  const fichas = await db.cliente.findMany({ where: { NOT: { telefone: '' }, userId: null }, select: { id: true, nome: true, criadoEm: true } });
  for (const [k, c] of fichas.entries()) {
    const data: Prisma.ClienteUpdateInput = {};
    if (r.chance(0.35)) data.instagram = c.nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').split(' ').slice(0, 2).join('_').slice(0, 30);
    if (r.chance(0.8)) data.origem = r.escolher<CanalAtendimento>(['whatsapp', 'whatsapp', 'instagram', 'loja', 'loja', 'indicacao', 'outro']);
    if (r.chance(0.3)) data.cpf = cpf(200000000 + k * 104729);
    if (r.chance(0.6)) data.aceitaOfertasEm = c.criadoEm;
    if (k % 37 === 5) data.descadastradaEm = antes(r.inteiro(1, 40));
    if (Object.keys(data).length) await db.cliente.update({ where: { id: c.id }, data });
  }
  // Ficha "Consumidor final" do caixa (a mesma que o caixa cria quando precisa).
  const consumidor = await db.cliente.create({ data: { nome: 'Consumidor final', telefone: '', email: 'consumidor-final@dcerutti.local', vendedorId: vendedoras[0].id } });
  log(`${novasComConta.length} clientes com conta a mais; fichas com Instagram, origem, CPF e consentimento`);

  // ---------- Reposição de estoque (entrada) para o catálogo continuar com peças depois de tantas vendas ----------
  const reposicao = await db.variante.findMany({ where: { produto: { referencia: { startsWith: 'SEED-' }, ativo: true } }, select: { id: true } });
  let repostas = 0;
  for (const v of reposicao) {
    if (!r.chance(0.65)) continue;
    await db.$transaction(tx => movimentar(tx, { varianteId: v.id, tipo: 'entrada', quantidade: r.inteiro(3, 12), usuarioId: ids.gestor, observacao: r.escolher(['Reposição do fornecedor', 'Coleção nova', 'Nota fiscal 4471']) }));
    repostas++;
  }
  await db.movimentoEstoque.updateMany({ where: { observacao: { in: ['Reposição do fornecedor', 'Coleção nova', 'Nota fiscal 4471'] } }, data: { criadoEm: antes(r.inteiro(5, 20)) } });
  invalidarCatalogo();
  log(`${repostas} tamanhos repostos`);

  // ---------- Cupons: cada tipo, alvo e situação ----------
  const cats = new Map((await db.categoria.findMany()).map(c => [c.slug, c.id]));
  const marcas = new Map((await db.marca.findMany()).map(m => [m.slug, m.id]));
  const ativos = await db.produto.findMany({ where: { ativo: true, referencia: { startsWith: 'SEED-' } }, select: { id: true, categoriaId: true, marcaId: true, preco: true, precoCheio: true } });
  const clientesVip = (await db.cliente.findMany({ where: { NOT: { telefone: '' }, userId: null }, take: 12, orderBy: { criadoEm: 'asc' }, select: { id: true } })).map(c => c.id);
  const produtosLive = ativos.filter((_, k) => k % 9 === 0).slice(0, 14).map(p => p.id);
  const base = { inicioEm: antes(150), criadoEm: antes(150) };
  const cupons: Prisma.CupomCreateInput[] = [
    { codigo: 'BEMVINDA10', descricao: 'Boas-vindas: 10% na primeira compra', tipo: 'percentual', valor: 10, tetoDesconto: 50, origem: 'primeiraCompra', somentePrimeiraCompra: true, diasAposCadastro: 30 },
    { codigo: 'INVERNO15', descricao: '15% em moletons e jaquetas', tipo: 'percentual', valor: 15, fimEm: depois(20), categorias: { create: ['moletons', 'jaquetas'].filter(s => cats.has(s)).map(s => ({ categoriaId: cats.get(s)! })) } },
    { codigo: 'DZARM20', descricao: '20% nas peças Dzarm, até R$ 80', tipo: 'percentual', valor: 20, tetoDesconto: 80, marcas: { create: [{ marcaId: marcas.get('dzarm')! }] } },
    { codigo: 'FRETEGRATIS', descricao: 'Frete grátis acima de R$ 150', tipo: 'freteGratis', minimoCompra: 150, quemAplica: 'cliente' },
    { codigo: 'DESCONTO30', descricao: 'R$ 30 em compras acima de R$ 200', tipo: 'valor', valor: 30, minimoCompra: 200, limiteTotal: 150 },
    { codigo: 'VIP50', descricao: 'R$ 50 para as clientes VIP', tipo: 'valor', valor: 50, minimoCompra: 250, quemAplica: 'equipe', limitePorCliente: 2, clientes: { create: clientesVip.map(clienteId => ({ clienteId })) } },
    { codigo: 'LIVE10', descricao: '10% nas peças da live, vale na promoção', tipo: 'percentual', valor: 10, valePromocao: true, produtos: { create: produtosLive.map(produtoId => ({ produtoId })) } },
    { codigo: 'BLACK25', descricao: 'Black Friday (agendado)', tipo: 'percentual', valor: 25, tetoDesconto: 120, inicioEm: depois(5), fimEm: depois(8) },
    { codigo: 'CARNAVAL', descricao: 'Campanha de carnaval (encerrada)', tipo: 'percentual', valor: 20, fimEm: antes(60) },
    { codigo: 'ULTIMOS5', descricao: 'R$ 5 para as 3 primeiras', tipo: 'valor', valor: 5, limiteTotal: 3, limitePorCliente: null },
    { codigo: 'DESLIGADO', descricao: 'Cupom pausado pelo gestor', tipo: 'percentual', valor: 5, ativo: false },
    { codigo: 'SEMLIMITE', descricao: '5% sem limite por cliente', tipo: 'percentual', valor: 5, limitePorCliente: null },
    { codigo: 'MODELO-PROXIMA-COMPRA', descricao: 'Campanha de próxima compra: 10% até R$ 40', tipo: 'percentual', valor: 10, tetoDesconto: 40, origem: 'proximaCompra', modelo: true },
  ];
  for (const c of cupons) await db.cupom.create({ data: { ...base, ...c, criadoPor: { connect: { id: ids.gestor } } } as Prisma.CupomCreateInput });
  // Cupons pessoais antigos (vencido e já usado), como os que a campanha gera.
  const modelo = await db.cupom.findUniqueOrThrow({ where: { codigo: 'MODELO-PROXIMA-COMPRA' } });
  for (const [k, cliId] of clientesVip.slice(0, 4).entries())
    await db.cupom.create({ data: { codigo: `VOLTA-DEMO${k + 1}`, descricao: 'Próxima compra: 10% até R$ 40', tipo: 'percentual', valor: 10, tetoDesconto: 40, origem: 'proximaCompra', modeloId: modelo.id, inicioEm: antes(120), fimEm: k < 2 ? antes(60) : depois(30), limiteTotal: 1, clientes: { create: { clienteId: cliId } }, criadoEm: antes(120) } });
  log(`${await db.cupom.count()} cupons`);

  // ---------- Pedidos com cupom ----------
  const clientesPedido = await db.cliente.findMany({ where: { NOT: { telefone: '' }, vendedor: { ativo: true } }, select: { id: true, nome: true, telefone: true, vendedorId: true, cep: true, userId: true } });
  const disponiveis = async (where: Prisma.ProdutoWhereInput = {}) =>
    (await db.variante.findMany({ where: { produto: { ativo: true, referencia: { startsWith: 'SEED-' }, ...where } }, select: { id: true, estoque: true, reservado: true, produtoId: true } })).filter(v => v.estoque - v.reservado > 0);
  const linhasDe = (vs: { id: number }[], n: number) => {
    const escolhidas = new Map<number, number>();
    for (let k = 0; k < n && vs.length; k++) escolhidas.set(r.escolher(vs).id, 1);
    return [...escolhidas].map(([varianteId, quantidade]) => ({ varianteId, quantidade }));
  };
  const regraFrete = { valor: 24.9, gratisAcima: 299 };
  const planoCupom: { codigo: string; quem: 'cliente' | 'equipe'; where?: Prisma.ProdutoWhereInput; n: [number, number]; clientes?: string[] }[] = [
    { codigo: 'INVERNO15', quem: 'cliente', where: { categoriaId: { in: [cats.get('moletons')!, cats.get('jaquetas')!] } }, n: [1, 3] },
    { codigo: 'DZARM20', quem: 'cliente', where: { marcaId: marcas.get('dzarm') }, n: [1, 3] },
    { codigo: 'FRETEGRATIS', quem: 'cliente', n: [2, 4] },
    { codigo: 'DESCONTO30', quem: 'equipe', n: [3, 5] },
    { codigo: 'VIP50', quem: 'equipe', n: [3, 6], clientes: clientesVip },
    { codigo: 'LIVE10', quem: 'cliente', where: { id: { in: produtosLive } }, n: [1, 2] },
    { codigo: 'SEMLIMITE', quem: 'equipe', n: [1, 3] },
    { codigo: 'ULTIMOS5', quem: 'cliente', n: [1, 2] },
  ];
  let comCupom = 0, recusados = 0;
  for (let i = 0; i < 110; i++) {
    const plano = planoCupom[i % planoCupom.length];
    const cli = plano.clientes ? clientesPedido.find(c => c.id === r.escolher(plano.clientes!)) ?? r.escolher(clientesPedido) : r.escolher(clientesPedido);
    const vs = await disponiveis(plano.where);
    const linhas = linhasDe(vs, r.inteiro(...plano.n));
    if (!linhas.length) continue;
    const origem = plano.quem === 'cliente' && cli.userId ? 'loja' : 'vendedor';
    try {
      const p = await criarPedido({
        tipo: 'compra', origem, clienteId: cli.id, vendedorId: cli.vendedorId, nomeCliente: cli.nome, telefoneCliente: cli.telefone, linhas,
        regraFrete, usuarioId: origem === 'loja' ? cli.userId : cli.vendedorId, cupom: { codigo: plano.codigo, quem: plano.quem },
      });
      const destino: Destino = r.chance(0.72) ? 'confirmado' : r.chance(0.5) ? 'cancelado' : 'pendente';
      await fechar(db, r, { id: p.id, tipo: 'compra' }, destino, destino === 'pendente' ? antes(0, r.inteiro(2, 90)) : antes(r.inteiro(1, 120), r.inteiro(0, 12)), cli.vendedorId, cli.userId);
      comCupom++;
    } catch {
      recusados++; // regra do cupom (mínimo, limite, peças) recusou: como na vida real, segue sem gravar
    }
  }
  // Primeira compra com BEMVINDA10: clientes novas, sem pedido.
  for (const c of novasComConta.slice(0, 18)) {
    const linhas = linhasDe(await disponiveis(), r.inteiro(1, 3));
    try {
      const p = await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: c.id, vendedorId: c.vendedorId, nomeCliente: c.nome, telefoneCliente: (await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).telefone, linhas, regraFrete, usuarioId: c.userId, cupom: { codigo: 'BEMVINDA10', quem: 'cliente' } });
      await fechar(db, r, { id: p.id, tipo: 'compra' }, r.chance(0.7) ? 'confirmado' : 'pendente', antes(r.inteiro(0, 25), r.inteiro(1, 20)), c.vendedorId, c.userId);
      comCupom++;
    } catch {
      recusados++;
    }
  }
  log(`${comCupom} pedidos com cupom (${recusados} recusados pela regra do cupom)`);

  // ---------- Caixa da loja: vendas no balcão com pagamento (Pix, cartão, dinheiro, dividido) ----------
  let caixa = 0;
  for (let i = 0; i < 160; i++) {
    const identificada = r.chance(0.7);
    const cli = identificada ? r.escolher(clientesPedido) : null;
    const vendedorId = cli?.vendedorId ?? r.escolher(vendedoras).id;
    const linhas = linhasDe(await disponiveis(), r.inteiro(1, 4));
    if (!linhas.length) break;
    const precos = new Map<number, number>();
    if (r.chance(0.3)) {
      const vs = await db.variante.findMany({ where: { id: { in: linhas.map(l => l.varianteId) } }, select: { id: true, produto: { select: { preco: true } } } });
      for (const v of vs) precos.set(v.id, r2(Number(v.produto.preco) * (1 - r.inteiro(3, 10) / 100)));
    }
    let p;
    try {
      p = await criarPedido({ tipo: 'compra', origem: 'balcao', clienteId: cli?.id ?? consumidor.id, vendedorId, nomeCliente: cli?.nome ?? 'Consumidor final', telefoneCliente: cli?.telefone ?? '', linhas, usuarioId: vendedorId, precos, cupom: cli && r.chance(0.08) ? { codigo: 'SEMLIMITE', quem: 'equipe' } : null });
    } catch {
      continue;
    }
    const quando = antes(r.inteiro(0, 150), r.inteiro(0, 9));
    await confirmarPedido(p.id, {}, vendedorId);
    const total = r2(p.total);
    const formas: { forma: FormaPagamento; valor: number; parcelas: number | null; recebido: number | null }[] = [];
    const umaForma = (forma: FormaPagamento, valor: number) => ({
      forma, valor, parcelas: forma === 'credito' ? r.inteiro(1, 6) : null,
      recebido: forma === 'dinheiro' ? Math.ceil(valor / r.escolher([10, 50, 100])) * r.escolher([10, 50, 100]) || valor : null,
    });
    if (r.chance(0.2) && total > 60) {
      const parte = r2(Math.round(total * r.escolher([0.3, 0.4, 0.5])));
      formas.push(umaForma('pix', parte), umaForma(r.escolher<FormaPagamento>(['credito', 'debito', 'dinheiro']), r2(total - parte)));
    } else formas.push(umaForma(r.escolher<FormaPagamento>(['pix', 'pix', 'pix', 'credito', 'credito', 'debito', 'dinheiro']), total));
    for (const f of formas) if (f.forma === 'dinheiro' && f.recebido != null && f.recebido < f.valor) f.recebido = Math.ceil(f.valor);
    await db.pagamento.createMany({ data: formas.map(f => ({ pedidoId: p.id, ...f, criadoEm: quando })) });
    await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando, confirmadoEm: quando, pagamentoSituacao: 'pago', entregaSituacao: 'entregue' } });
    await db.venda.updateMany({ where: { pedidoId: p.id }, data: { data: quando, criadoEm: quando, observacao: 'Caixa da loja' } });
    await db.movimentoEstoque.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: quando } });
    await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: quando } });
    caixa++;
  }
  log(`${caixa} vendas no caixa com pagamento`);

  // ---------- Sugestões (carrinhos montados pela vendedora), em todas as situações ----------
  invalidarCatalogo();
  const lista = (await catalogo()).filter(p => p.variantes.some(v => v.disponivel));
  const clientesSug = await db.cliente.findMany({ where: { vendedorId: { in: vendedoras.map(v => v.id) }, userId: null, NOT: { telefone: '' }, descadastradaEm: null }, select: { id: true, vendedorId: true, cep: true, cidade: true } });
  const celular = (await db.cliente.findMany({ where: { id: { in: clientesSug.map(c => c.id) } }, select: { id: true, telefone: true } })).filter(c => c.telefone.replace(/\D/g, '').length === 11).map(c => c.id);
  const aptas = clientesSug.filter(c => celular.includes(c.id));
  const titulos = ['Novidades no seu tamanho', 'Separei para você', 'Peças da coleção de inverno', 'Achei a sua cara!', 'Promoções da semana', 'Para o fim de semana'];
  let sugeridas = 0;
  const situacoes: Record<string, number> = {};
  for (let i = 0; i < 90 && aptas.length; i++) {
    const cli = aptas[(i * 7) % aptas.length];
    const u = usuario(cli.vendedorId);
    const pecas = Array.from({ length: r.inteiro(3, 8) }, () => r.escolher(lista)).filter((p, k, a) => a.findIndex(x => x.id === p.id) === k);
    const itens = pecas.map(p => {
      const v = p.variantes.find(x => x.disponivel);
      return { produtoId: p.id, varianteId: r.chance(0.7) ? v?.id ?? null : null, precoOferta: r.chance(0.3) ? r2(p.preco * 0.92) : null, nota: r.chance(0.25) ? r.escolher(['Veste bem no corpo', 'Combina com a calça que você levou', 'Última peça nessa cor']) : null };
    });
    let s;
    try {
      s = await criarSugestao(u, { clienteId: cli.id, titulo: r.escolher(titulos), mensagem: r.chance(0.6) ? 'Oi! Separei essas peças pensando em você. Marca o que gostou 💛' : null, dias: r.escolher([3, 7, 7, 15, 30]), itens, enviar: !r.chance(0.08), cupom: r.chance(0.12) ? 'SEMLIMITE' : null });
    } catch {
      continue;
    }
    sugeridas++;
    const criada = antes(r.inteiro(0, 6), r.inteiro(0, 20));
    const sorte = r.proximo();
    const salvos = await db.sugestaoItem.findMany({ where: { sugestaoId: s.id } });
    const escolhas = (quero: number): EscolhaItem[] => salvos.map((it, k) => {
      const p = lista.find(x => x.id === it.produtoId);
      return { id: it.id, escolha: k < quero ? 'quero' : r.escolher(['talvez', 'nao', 'pendente'] as const), varianteId: it.varianteId ?? p?.variantes.find(v => v.disponivel)?.id ?? null, quantidade: 1 };
    });
    let situacao = s.enviadaEm ? 'enviada' : 'para_enviar';
    try {
      if (s.enviadaEm && sorte < 0.2) {
        // Vista, às vezes com lembrete.
        for (let k = r.inteiro(1, 4); k > 0; k--) await registrarVista(s.codigo);
        if (r.chance(0.5)) await db.sugestao.update({ where: { id: s.id }, data: { lembradoEm: antes(0, r.inteiro(1, 20)), lembretes: r.inteiro(1, 2) } });
        situacao = 'vista';
      } else if (s.enviadaEm && sorte < 0.35) {
        await registrarVista(s.codigo);
        await salvarEscolhas(s.codigo, escolhas(1));
        await responderSugestao(s.codigo, 'pensando', escolhas(r.inteiro(1, 2)), {});
        situacao = 'pensando';
      } else if (s.enviadaEm && sorte < 0.62) {
        await registrarVista(s.codigo);
        const condicional = cli.cidade === 'Maravilha' && r.chance(0.4);
        const { pedido } = await responderSugestao(s.codigo, condicional ? 'condicional' : 'compra', escolhas(r.inteiro(1, Math.min(3, salvos.length))), { cep: condicional ? F.CEPS_CONDICIONAL[0] : null });
        if (pedido) await fechar(db, r, { id: pedido.id, tipo: condicional ? 'condicional' : 'compra' }, r.chance(0.6) ? 'confirmado' : 'pendente', new Date(criada.getTime() + r.inteiro(2, 30) * HORA), cli.vendedorId);
        situacao = 'convertida';
      } else if (sorte < 0.72) {
        await cancelarSugestao(u, s.id);
        situacao = 'cancelada';
      } else if (s.enviadaEm && sorte < 0.82) {
        await registrarVista(s.codigo);
        situacao = 'vencida';
      }
    } catch {
      situacao = `${situacao}*`; // peça esgotou no meio: fica como estava
    }
    situacoes[situacao] = (situacoes[situacao] ?? 0) + 1;
    // Datas coerentes com a validade: a vencida foi criada antes e já passou do prazo.
    const dias = Math.round((s.validaAte.getTime() - Date.now()) / DIA);
    const inicio = situacao === 'vencida' ? antes(dias + r.inteiro(2, 30)) : criada;
    const atual = await db.sugestao.findUniqueOrThrow({ where: { id: s.id } });
    const desloca = (d: Date | null) => (d ? new Date(Math.min(Date.now() - 60_000, inicio.getTime() + (d.getTime() - atual.criadaEm.getTime()) + r.inteiro(1, 6) * HORA)) : null);
    await db.sugestao.update({
      where: { id: s.id },
      data: {
        criadaEm: inicio, validaAte: new Date(inicio.getTime() + dias * DIA), enviadaEm: atual.enviadaEm ? inicio : null,
        vistaEm: desloca(atual.vistaEm), respondidaEm: desloca(atual.respondidaEm),
      },
    });
  }
  log(`${sugeridas} sugestões: ${JSON.stringify(situacoes)}`);

  // ---------- Pedidos editados e vendas desfeitas (pelas regras do sistema) ----------
  const pendentes = await db.pedido.findMany({ where: { status: 'pendente', cobrancas: { none: {} } }, include: { itens: true }, take: 12, orderBy: { criadoEm: 'desc' } });
  let editados = 0;
  for (const p of pendentes) {
    const linhas = p.itens.map((it, k) => ({ itemId: it.id, varianteId: it.varianteId, quantidade: it.quantidade, preco: k === 0 ? r2(Number(it.precoUnitario) * 0.95) : Number(it.precoUnitario) }));
    const extra = (await disponiveis()).find(v => !linhas.some(l => l.varianteId === v.id));
    if (extra && r.chance(0.5)) {
      const prod = await db.produto.findUniqueOrThrow({ where: { id: extra.produtoId }, select: { preco: true } });
      linhas.push({ itemId: undefined as unknown as number, varianteId: extra.id, quantidade: 1, preco: Number(prod.preco) });
    }
    try {
      await editarPedido(p.id, linhas.map(l => (l.itemId ? l : { varianteId: l.varianteId, quantidade: l.quantidade, preco: l.preco })), p.frete == null ? null : regraFrete, { usuarioId: p.vendedorId, observacao: r.escolher(['Cliente pediu desconto na primeira peça', 'Acrescentei uma peça a pedido dela', null]) });
      await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id, acao: 'editado' }, data: { criadoEm: new Date(p.criadoEm.getTime() + r.inteiro(1, 5) * HORA) } });
      editados++;
    } catch { /* estoque mudou: segue */ }
  }
  const paraDesfazer = await db.pedido.findMany({ where: { status: 'confirmado', origem: { not: 'balcao' }, tipo: 'compra', cobrancas: { none: {} }, pagamentos: { none: {} } }, take: 8, orderBy: { confirmadoEm: 'desc' }, skip: 30 });
  let desfeitas = 0;
  for (const p of paraDesfazer) {
    try {
      await desfazerVenda(p.id, p.vendedorId, r.escolher(['Cliente devolveu as peças', 'Pagamento não caiu', 'Troca por outro modelo']));
      const quando = new Date((p.confirmadoEm ?? p.criadoEm).getTime() + r.inteiro(1, 4) * DIA);
      await db.pedido.update({ where: { id: p.id }, data: { canceladoEm: new Date(Math.min(Date.now() - 60_000, quando.getTime())) } });
      await db.movimentoEstoque.updateMany({ where: { pedidoId: p.id, motivo: 'estorno' }, data: { criadoEm: quando } });
      desfeitas++;
    } catch { /* regra recusou: segue */ }
  }
  log(`${editados} pedidos editados, ${desfeitas} vendas desfeitas`);

  // ---------- Situação manual de pagamento e entrega, e o número da loja de cada pedido ----------
  const pedidos = await db.pedido.findMany({ where: { origem: { not: 'balcao' } }, select: { id: true, status: true, vendedorId: true, criadoEm: true, tipo: true } });
  for (const p of pedidos) {
    const velho = agora - p.criadoEm.getTime() > 10 * DIA;
    const data: Prisma.PedidoUncheckedUpdateInput = { numeroId: numeroDe.get(p.vendedorId) ?? padrao.id };
    if (p.status === 'confirmado') {
      data.pagamentoSituacao = p.tipo === 'condicional' ? r.escolher(['pago', 'pago', 'a_combinar']) : r.escolher(['pago', 'pago', 'pago', 'aguardando', 'a_combinar']);
      data.entregaSituacao = velho ? r.escolher(['entregue', 'entregue', 'entregue', 'enviado']) : r.escolher(['separando', 'enviado', 'entregue', 'a_combinar']);
    } else if (p.status === 'pendente') data.pagamentoSituacao = r.escolher(['a_combinar', 'aguardando']);
    await db.pedido.update({ where: { id: p.id }, data });
  }
  log('situação de pagamento, entrega e número da loja nos pedidos');

  // ---------- Pagamento online (Mercado Pago): cobranças em cada situação, com os avisos ----------
  const online = await db.pedido.findMany({ where: { origem: 'loja', tipo: 'compra' }, select: { id: true, status: true, total: true, frete: true, criadoEm: true, confirmadoEm: true, canceladoEm: true, clienteId: true, cliente: { select: { userId: true } } }, orderBy: { criadoEm: 'desc' } });
  const ordemId = () => `ORD01${randomBytes(10).toString('hex').toUpperCase()}`;
  let cobrancas = 0;
  const criarCobranca = async (p: (typeof online)[number], status: StatusCobranca, quando: Date, extra: Partial<Prisma.CobrancaUncheckedCreateInput> = {}) => {
    const valor = r2(Number(p.total) + Number(p.frete ?? 0));
    const metodo = r.chance(0.6) ? 'pix' : 'checkout';
    const mpOrderId = status === 'criada' ? null : ordemId();
    const aprovada = ['aprovada', 'estornada', 'estornada_parcial', 'contestada'].includes(status);
    const meio = metodo === 'pix' ? 'pix' : r.escolher(['visa', 'master', 'elo', 'account_money']);
    const c = await db.cobranca.create({
      data: {
        pedidoId: p.id, metodo, status, valor, chave: randomUUID(), mpOrderId, mpPaymentId: mpOrderId ? `PAY01${randomBytes(9).toString('hex').toUpperCase()}` : null,
        statusMp: ({ criada: null, pendente: 'action_required', aprovada: 'processed', recusada: 'failed', expirada: 'expired', cancelada: 'canceled', estornada: 'refunded', estornada_parcial: 'processed', contestada: 'charged_back' } as Record<string, string | null>)[status],
        pixCopiaECola: metodo === 'pix' ? `00020126580014br.gov.bcb.pix0136${randomUUID()}5204000053039865406${valor.toFixed(2)}5802BR5909DCERUTTI6009MARAVILHA62070503***6304ABCD` : null,
        checkoutUrl: metodo === 'checkout' ? `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${randomBytes(8).toString('hex')}` : null,
        expiraEm: new Date(quando.getTime() + (metodo === 'pix' ? 30 : 60) * 60_000),
        aprovadaEm: aprovada ? new Date(quando.getTime() + r.inteiro(1, 20) * 60_000) : null,
        meio: aprovada ? meio : null, tipoMeio: aprovada ? (meio === 'pix' ? 'bank_transfer' : meio === 'account_money' ? 'account_money' : 'credit_card') : null,
        parcelas: aprovada && metodo === 'checkout' && meio !== 'account_money' ? r.inteiro(1, 6) : null,
        taxa: aprovada ? r2(valor * (metodo === 'pix' ? 0.0099 : 0.0498)) : null,
        valorEstornado: status === 'estornada' ? valor : status === 'estornada_parcial' ? r2(valor * 0.4) : 0,
        criadaPorId: r.chance(0.5) ? p.cliente.userId : null, consultadaEm: mpOrderId ? new Date(quando.getTime() + 25 * 60_000) : null,
        criadaEm: quando, ...extra,
      },
    });
    const eventos: Prisma.EventoPagamentoCreateManyInput[] = [{ cobrancaId: c.id, origem: 'acao', tipo: 'order.created', mpOrderId, statusMp: 'action_required', dados: { metodo, valor }, processadoEm: quando, criadoEm: quando }];
    if (mpOrderId && status !== 'pendente') {
      const t = new Date(quando.getTime() + r.inteiro(1, 25) * 60_000);
      eventos.push({ cobrancaId: c.id, origem: 'webhook', requestId: randomUUID(), tipo: `order.${c.statusMp}`, mpOrderId, statusMp: c.statusMp, dados: { status: c.statusMp, valor }, processadoEm: t, criadoEm: t });
      if (r.chance(0.4)) eventos.push({ cobrancaId: c.id, origem: 'conciliacao', tipo: 'consulta', mpOrderId, statusMp: c.statusMp, dados: { status: c.statusMp }, processadoEm: new Date(t.getTime() + HORA), criadoEm: new Date(t.getTime() + HORA) });
      if (status.startsWith('estornada') || status === 'contestada') eventos.push({ cobrancaId: c.id, origem: status === 'contestada' ? 'webhook' : 'acao', requestId: randomUUID(), tipo: status === 'contestada' ? 'order.charged_back' : 'refund.created', mpOrderId, statusMp: c.statusMp, dados: { valor: Number(c.valorEstornado) }, processadoEm: new Date(t.getTime() + 2 * DIA), criadoEm: new Date(t.getTime() + 2 * DIA) });
    }
    await db.eventoPagamento.createMany({ data: eventos });
    if (aprovada) {
      const forma: FormaPagamento = meio === 'pix' ? 'pix' : meio === 'account_money' ? 'mercado_pago' : 'credito';
      await db.pagamento.create({ data: { pedidoId: p.id, forma, valor, parcelas: forma === 'credito' ? c.parcelas ?? 1 : null, cobrancaId: c.id, criadoEm: c.aprovadaEm ?? quando } });
    }
    cobrancas++;
    return c;
  };
  const confirmadosOnline = online.filter(p => p.status === 'confirmado');
  const pendentesOnline = online.filter(p => p.status === 'pendente');
  const canceladosOnline = online.filter(p => p.status === 'cancelado');
  for (const [k, p] of confirmadosOnline.slice(0, 70).entries()) {
    const quando = new Date(p.criadoEm.getTime() + 10 * 60_000);
    if (k % 6 === 0) await criarCobranca(p, r.escolher(['recusada', 'expirada']), new Date(quando.getTime() - 40 * 60_000)); // tentativa anterior
    const status: StatusCobranca = k === 3 || k === 41 ? 'estornada' : k === 9 ? 'estornada_parcial' : k === 17 ? 'contestada' : 'aprovada';
    await criarCobranca(p, status, quando, k === 25 ? { semEstoque: true } : {});
    await db.pedido.update({ where: { id: p.id }, data: { pagamentoSituacao: status === 'estornada' ? 'estornado' : 'pago' } });
  }
  for (const [k, p] of pendentesOnline.slice(0, 14).entries()) {
    const quando = k % 3 === 0 ? antes(0, 0.2) : new Date(p.criadoEm.getTime() + 5 * 60_000);
    if (k % 2) await criarCobranca(p, 'expirada', new Date(quando.getTime() - 2 * HORA));
    await criarCobranca(p, k % 3 === 0 ? 'pendente' : r.escolher(['criada', 'expirada', 'recusada', 'cancelada']), quando, k % 3 === 0 ? { expiraEm: depois(0, 0.4) } : {});
    if (k % 3 === 0) await db.pedido.update({ where: { id: p.id }, data: { pagamentoSituacao: 'aguardando' } });
  }
  for (const p of canceladosOnline.slice(0, 12)) await criarCobranca(p, r.escolher(['expirada', 'cancelada', 'recusada']), new Date(p.criadoEm.getTime() + 15 * 60_000));
  // Aviso sem cobrança conhecida e aviso repetido com erro: aparecem na auditoria.
  await db.eventoPagamento.createMany({
    data: [
      { origem: 'webhook', requestId: randomUUID(), tipo: 'order.processed', mpOrderId: ordemId(), statusMp: 'processed', erro: 'Cobrança não encontrada para esta order', criadoEm: antes(12) },
      { origem: 'webhook', requestId: randomUUID(), tipo: 'order.processed', mpOrderId: ordemId(), statusMp: 'processed', erro: 'Assinatura inválida', criadoEm: antes(3) },
      { origem: 'conciliacao', tipo: 'varredura', dados: { conferidas: 14, alteradas: 1 }, processadoEm: antes(0, 2), criadoEm: antes(0, 2) },
    ],
  });
  log(`${cobrancas} cobranças online`);

  // ---------- Vitrines: lives e publicações em cada situação ----------
  const vitrinesPlano = [
    { slug: 'live-de-sexta-inverno', tipo: 'live', status: 'no_ar', titulo: 'Live de sexta: inverno', inicioEm: antes(0, 1) },
    { slug: 'live-dia-das-maes', tipo: 'live', status: 'encerrada', titulo: 'Live Dia das Mães', inicioEm: antes(45), fimEm: antes(45, -2) },
    { slug: 'live-black-friday', tipo: 'live', status: 'agendada', titulo: 'Live Black Friday', inicioPrevisto: depois(4) },
    { slug: 'colecao-inverno-2026', tipo: 'post', status: 'publicada', titulo: 'Coleção Inverno 2026', inicioEm: antes(30), ofertaAte: depois(10) },
    { slug: 'look-do-dia-vestidos', tipo: 'reels', status: 'publicada', titulo: 'Look do dia: vestidos', inicioEm: antes(8) },
    { slug: 'promo-relampago', tipo: 'story', status: 'encerrada', titulo: 'Promo relâmpago 24h', inicioEm: antes(15), fimEm: antes(14), ofertaAte: antes(14) },
    { slug: 'basicos-que-amamos', tipo: 'post', status: 'arquivada', titulo: 'Básicos que amamos', inicioEm: antes(120), fimEm: antes(90) },
    { slug: 'pijamas-quentinhos', tipo: 'reels', status: 'rascunho', titulo: 'Pijamas quentinhos' },
    { slug: 'kids-volta-as-aulas', tipo: 'post', status: 'encerrada', titulo: 'Kids: volta às aulas', inicioEm: antes(100), fimEm: antes(80) },
    { slug: 'fitness-semana', tipo: 'story', status: 'agendada', titulo: 'Semana fitness', inicioPrevisto: depois(9) },
  ] as const;
  const vitrines: { id: string; inicio: Date | null; fim: Date | null; status: string }[] = [];
  for (const [k, v] of vitrinesPlano.entries()) {
    const pecas = ativos.slice((k * 13) % ativos.length).concat(ativos).slice(0, r.inteiro(5, 14));
    const criada = await db.vitrine.create({
      data: {
        ...v, responsavelId: k % 3 === 0 ? ids.supervisora : vendedoras[k % vendedoras.length].id,
        descricao: `${v.titulo}: as peças que mostramos, com preço especial enquanto durar.`,
        urlInstagram: v.status === 'rascunho' ? null : `https://www.instagram.com/${v.tipo === 'reels' ? 'reel' : 'p'}/${randomBytes(6).toString('base64url')}/`,
        legenda: v.tipo === 'live' ? null : 'Comenta QUERO que a gente te chama no direct 💬',
        visitas: v.status === 'rascunho' || v.status === 'agendada' ? 0 : r.inteiro(40, 900),
        criadoEm: 'inicioEm' in v && v.inicioEm ? new Date(v.inicioEm.getTime() - 2 * DIA) : antes(3),
        pecas: { create: pecas.map((p, ordem) => ({ produtoId: p.id, ordem, precoOferta: r.chance(0.6) ? r2(Number(p.preco) * r.escolher([0.8, 0.85, 0.9])) : null })) },
      },
    });
    vitrines.push({ id: criada.id, inicio: 'inicioEm' in v ? v.inicioEm : null, fim: 'fimEm' in v ? v.fimEm : null, status: v.status });
  }
  // Pedidos da loja que vieram de uma vitrine (dentro do período dela).
  let deVitrine = 0;
  for (const v of vitrines.filter(x => x.inicio)) {
    const fim = v.fim ? new Date(v.fim.getTime() + 3 * DIA) : new Date();
    const doPeriodo = await db.pedido.findMany({ where: { origem: 'loja', vitrineId: null, criadoEm: { gte: v.inicio!, lte: fim } }, take: r.inteiro(3, 10), select: { id: true } });
    await db.pedido.updateMany({ where: { id: { in: doPeriodo.map(p => p.id) } }, data: { vitrineId: v.id } });
    deVitrine += doPeriodo.length;
  }
  log(`${vitrines.length} vitrines a mais, ${deVitrine} pedidos ligados a elas`);

  // ---------- Atendimentos: cada canal e etapa, com notas, contatos, peças e transferências ----------
  const atContador = await db.contador.findUniqueOrThrow({ where: { nome: 'AT' } });
  let at = atContador.valor;
  const usados = new Set((await db.atendimento.findMany({ where: { NOT: { pedidoId: null } }, select: { pedidoId: true } })).map(a => a.pedidoId!));
  const comPedido = await db.pedido.findMany({ where: { origem: { in: ['vendedor', 'loja'] }, status: { in: ['confirmado', 'pendente'] } }, select: { id: true, codigo: true, status: true, clienteId: true, vendedorId: true, criadoEm: true, confirmadoEm: true }, orderBy: { criadoEm: 'desc' }, take: 200 });
  const variantesAt = await disponiveis();
  const etapas: EtapaAtendimento[] = ['novo', 'novo', 'em_conversa', 'em_conversa', 'em_conversa', 'proposta', 'proposta', 'aguardando_pagamento', 'ganho', 'ganho', 'ganho', 'perdido', 'perdido'];
  const canais: CanalAtendimento[] = ['whatsapp', 'whatsapp', 'instagram', 'instagram', 'loja', 'link_peca', 'vitrine', 'live', 'indicacao', 'outro'];
  const nomesEtapa: Record<string, string> = { novo: 'Novo', em_conversa: 'Em conversa', proposta: 'Proposta', aguardando_pagamento: 'Aguardando pagamento', ganho: 'Ganho', perdido: 'Perdido' };
  let atendimentos = 0;
  for (let i = 0; i < 120; i++) {
    const etapa = etapas[i % etapas.length];
    const canal = canais[(i * 3) % canais.length];
    const precisaPedido = etapa === 'ganho' || etapa === 'aguardando_pagamento';
    const pedido = precisaPedido ? comPedido.find(p => !usados.has(p.id) && (etapa === 'ganho' ? p.status === 'confirmado' : p.status === 'pendente')) : undefined;
    if (precisaPedido && !pedido) continue;
    if (pedido) usados.add(pedido.id);
    const semFicha = !pedido && r.chance(0.3);
    const cli = pedido ? { id: pedido.clienteId, vendedorId: pedido.vendedorId } : semFicha ? null : r.escolher(clientesPedido);
    const responsavelId = pedido?.vendedorId ?? (r.chance(0.1) ? null : cli?.vendedorId ?? r.escolher(vendedoras).id);
    const criado = pedido ? new Date(pedido.criadoEm.getTime() - r.inteiro(1, 48) * HORA) : antes(r.inteiro(0, 90), r.inteiro(0, 20));
    const aberto = etapa !== 'ganho' && etapa !== 'perdido';
    const nome = `${r.escolher(F.NOMES)} ${r.escolher(F.SOBRENOMES)}`;
    const vit = canal === 'vitrine' || canal === 'live' ? r.escolher(vitrines.filter(v => v.inicio)) : null;
    const publico = canal === 'link_peca' || canal === 'vitrine' || canal === 'live';
    const ultimo = etapa === 'novo' ? null : new Date(Math.min(agora - HORA, criado.getTime() + r.inteiro(1, 72) * HORA));
    const a = await db.atendimento.create({
      data: {
        codigo: `AT-${String(++at).padStart(6, '0')}`, clienteId: cli?.id ?? null,
        contatoNome: semFicha ? nome : null,
        contatoTelefone: semFicha && canal !== 'instagram' ? formatarTelefone(`4999${String(1000000 + i * 4567).slice(0, 7)}`) : null,
        contatoInstagram: semFicha && (canal === 'instagram' || r.chance(0.3)) ? nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '_') : null,
        responsavelId, numeroId: responsavelId ? numeroDe.get(responsavelId) ?? padrao.id : null, canal, etapa,
        motivoPerda: etapa === 'perdido' ? r.escolher(Object.keys(MOTIVOS_PERDA)) : null,
        proximoContatoEm: aberto && etapa !== 'novo' ? r.escolher([antes(r.inteiro(1, 5)), antes(0, -r.inteiro(1, 8)), depois(r.inteiro(1, 10))]) : null,
        primeiroContatoEm: ultimo ? new Date(criado.getTime() + r.inteiro(1, 6) * HORA) : null, ultimoContatoEm: ultimo,
        pedidoId: pedido?.id ?? null, aceitouContatoEm: publico ? criado : null, aceitouOfertasEm: publico && r.chance(0.5) ? criado : null,
        vitrineId: vit?.id ?? null, criadoEm: criado,
        fechadoEm: etapa === 'ganho' ? pedido?.confirmadoEm ?? criado : etapa === 'perdido' ? new Date(criado.getTime() + r.inteiro(1, 10) * DIA) : null,
      },
    });
    const pecas = new Set<number>();
    for (let k = r.inteiro(0, 3); k > 0; k--) pecas.add(r.escolher(variantesAt).id);
    if (pecas.size) await db.atendimentoItem.createMany({ data: [...pecas].map(varianteId => ({ atendimentoId: a.id, varianteId, produtoId: variantesAt.find(v => v.id === varianteId)!.produtoId, quantidade: 1 })) });
    const reg: Prisma.AtendimentoRegistroCreateManyInput[] = [];
    let t = criado.getTime();
    const passo = () => new Date(Math.min(agora - 60_000, (t += r.inteiro(1, 20) * HORA)));
    if (r.chance(0.6)) reg.push({ atendimentoId: a.id, tipo: 'nota', texto: r.escolher(['Viu a peça no story e perguntou o preço', 'Quer para presente, tamanho M', 'Prefere entrega à tarde', 'Cliente antiga, gosta de tricô']), usuarioId: responsavelId, criadoEm: passo() });
    if (etapa !== 'novo') reg.push({ atendimentoId: a.id, tipo: canal === 'instagram' ? 'contato_direct' : 'contato_whatsapp', usuarioId: responsavelId, criadoEm: passo() });
    if (etapa !== 'novo' && r.chance(0.35)) reg.push({ atendimentoId: a.id, tipo: 'envio_peca', texto: 'Blusa tricô · Off-white · tam. M', usuarioId: responsavelId, criadoEm: passo() });
    if (r.chance(0.15) && responsavelId) reg.push({ atendimentoId: a.id, tipo: 'transferencia', texto: 'Encaminhado pela gestora', usuarioId: ids.gestor, criadoEm: passo() });
    if (etapa !== 'novo') reg.push({ atendimentoId: a.id, tipo: 'etapa', texto: `Novo → ${nomesEtapa[etapa]}${etapa === 'perdido' ? ` (${MOTIVOS_PERDA[a.motivoPerda!]})` : ''}`, usuarioId: responsavelId, criadoEm: passo() });
    if (pedido) reg.push({ atendimentoId: a.id, tipo: 'pedido', texto: `Pedido ${pedido.codigo}`, usuarioId: responsavelId, criadoEm: passo() });
    if (reg.length) await db.atendimentoRegistro.createMany({ data: reg });
    atendimentos++;
  }
  await db.contador.update({ where: { nome: 'AT' }, data: { valor: at } });
  log(`${atendimentos} atendimentos a mais`);

  // ---------- Pós-venda: contatos programados pela regra, metade dos vencidos já feitos ----------
  const vendidos = await db.pedido.findMany({ where: { status: 'confirmado', venda: { isNot: null } }, select: { id: true, confirmadoEm: true }, orderBy: { confirmadoEm: 'asc' } });
  for (const p of vendidos) await programarPosVenda(p.id, p.confirmadoEm ?? new Date());
  const vencidos = await db.posVendaContato.findMany({ where: { feitoEm: null, venceEm: { lt: antes(1) } }, include: { cliente: { select: { vendedorId: true } } } });
  for (const c of vencidos) {
    if (!r.chance(0.7)) continue;
    await db.posVendaContato.update({ where: { id: c.id }, data: { feitoEm: new Date(Math.min(agora - HORA, c.venceEm.getTime() + r.inteiro(0, 3) * DIA)), resultado: r.escolher(Object.keys(RESULTADOS_POS_VENDA)), usuarioId: c.cliente.vendedorId } });
  }
  log(`${await db.posVendaContato.count()} contatos de pós-venda`);

  // ---------- Histórico de navegação das clientes com conta, favoritos e sacolas ----------
  const comConta = await db.cliente.findMany({ where: { NOT: { userId: null } }, select: { id: true, userId: true, criadoEm: true } });
  const produtosLoja = await db.produto.findMany({ where: { ativo: true }, select: { id: true, referencia: true, variantes: { select: { id: true, tamanho: true } } } });
  const slugsCat = [...cats.keys()];
  const termos = ['vestido', 'moletom', 'calça jeans', 'pijama', 'tricô', 'jaqueta', 'camiseta básica', 'saia', 'blusa preta', 'shorts'];
  let atividades = 0;
  for (const c of comConta) {
    const eventos: Prisma.AtividadeCreateManyInput[] = [];
    const visitas = r.inteiro(1, 12);
    let ultimo = null as Date | null;
    for (let v = 0; v < visitas; v++) {
      let t = Math.max(c.criadoEm.getTime(), agora - r.inteiro(0, 60) * DIA - r.inteiro(0, 23) * HORA);
      const aparelho = r.escolher(APARELHOS);
      const ev = (d: Omit<Prisma.AtividadeCreateManyInput, 'clienteId' | 'aparelho' | 'criadoEm'>) => eventos.push({ clienteId: c.id, aparelho, criadoEm: new Date((t += r.inteiro(10, 240) * 1000)), ...d });
      if (r.chance(0.3)) ev({ tipo: 'login' });
      ev({ tipo: 'acesso', caminho: '/' });
      ev({ tipo: 'pagina', caminho: '/', ref: randomBytes(8).toString('hex'), duracaoSeg: r.inteiro(5, 60) });
      for (let k = r.inteiro(1, 8); k > 0; k--) {
        const sorte = r.proximo();
        const p = r.escolher(produtosLoja);
        if (sorte < 0.45) {
          ev({ tipo: 'produto', caminho: `/produto/${p.referencia}`, produtoId: p.id, ref: randomBytes(8).toString('hex'), duracaoSeg: r.inteiro(8, 240) });
          if (p.variantes.length && r.chance(0.5)) {
            const va = r.escolher(p.variantes);
            ev({ tipo: 'tamanho', produtoId: p.id, varianteId: va.id, termo: va.tamanho });
            if (r.chance(0.5)) ev({ tipo: 'sacola', produtoId: p.id, varianteId: va.id, termo: va.tamanho, dados: { delta: r.chance(0.85) ? 1 : -1 } });
          }
        } else if (sorte < 0.6) {
          const termo = r.escolher(termos);
          ev({ tipo: 'busca', caminho: `/catalogo?q=${encodeURIComponent(termo)}`, termo, dados: { filtros: {}, resultados: r.inteiro(0, 40) }, ref: randomBytes(8).toString('hex'), duracaoSeg: r.inteiro(5, 90) });
        } else if (sorte < 0.8) {
          const categoria = r.escolher(slugsCat);
          const tamanho = r.chance(0.5) ? r.escolher(['P', 'M', 'G', 'GG']) : undefined;
          ev({ tipo: 'filtro', caminho: `/catalogo?categoria=${categoria}${tamanho ? `&tamanho=${tamanho}` : ''}`, dados: { filtros: { categoria, ...(tamanho ? { tamanho } : {}), ...(r.chance(0.2) ? { promo: true } : {}) } }, ref: randomBytes(8).toString('hex'), duracaoSeg: r.inteiro(10, 180) });
        } else if (sorte < 0.88) {
          ev({ tipo: 'pagina', caminho: r.escolher(['/minha-conta', '/minha-conta/pedidos', '/favoritos', '/sacola', '/catalogo']), ref: randomBytes(8).toString('hex'), duracaoSeg: r.inteiro(5, 120) });
        } else if (sorte < 0.94) {
          const termo = r.escolher(['BEMVINDA10', 'FRETEGRATIS', 'CARNAVAL', 'DESCONTO30', 'XPTO']);
          ev({ tipo: 'cupom', termo, dados: termo === 'CARNAVAL' ? { ok: false, erro: 'Este cupom já encerrou.' } : termo === 'XPTO' ? { ok: false, erro: 'Cupom não encontrado.' } : { ok: true } });
        } else ev({ tipo: 'whatsapp', caminho: `/produto/${p.referencia}` });
      }
      ultimo = new Date(Math.max(ultimo?.getTime() ?? 0, t));
    }
    const ordenados = eventos.filter(e => (e.criadoEm as Date).getTime() < agora);
    await db.atividade.createMany({ data: ordenados });
    atividades += ordenados.length;
    const logins = ordenados.filter(e => e.tipo === 'login').map(e => (e.criadoEm as Date).getTime());
    await db.cliente.update({ where: { id: c.id }, data: { ultimoAcessoEm: ultimo != null && (ultimo as Date).getTime() < agora ? (ultimo as Date) : antes(1), ultimoLoginEm: logins.length ? new Date(Math.max(...logins)) : c.criadoEm } });
    // Favoritos.
    const favs = new Set<number>();
    for (let k = r.inteiro(0, 10); k > 0; k--) favs.add(r.escolher(produtosLoja).id);
    if (favs.size) await db.favorito.createMany({ data: [...favs].map(produtoId => ({ clienteId: c.id, produtoId, criadoEm: antes(r.inteiro(0, 50)) })) });
  }
  // Sacolas guardadas: recentes, paradas (já avisadas) e esquecidas.
  let sacolas = 0;
  for (const [k, c] of comConta.entries()) {
    if (k % 3 === 2) continue;
    const itens = Array.from({ length: r.inteiro(1, 4) }, () => ({ varianteId: r.escolher(variantesAt).id, quantidade: r.chance(0.85) ? 1 : 2 }));
    await db.sacolaCliente.create({ data: { clienteId: c.id, itens } });
    const atualizada = k % 3 === 0 ? antes(0, r.inteiro(1, 10)) : antes(r.inteiro(2, 20));
    await db.$executeRaw`UPDATE sacola_cliente SET atualizadoEm = ${atualizada}, avisadoEm = ${k % 3 === 1 ? new Date(atualizada.getTime() + DIA) : null} WHERE clienteId = ${c.id}`;
    sacolas++;
  }
  log(`${atividades} registros de navegação, ${await db.favorito.count()} favoritos, ${sacolas} sacolas`);

  // ---------- Vídeos de produto (gerados com ffmpeg, quando houver) ----------
  try {
    const pasta = path.join(DIR_ARQUIVOS, 'produtos', F.PASTA_FOTOS);
    await mkdir(pasta, { recursive: true });
    const urls: { url: string; capa: string }[] = [];
    for (let k = 0; k < 3; k++) {
      const nome = `video-${k + 1}.mp4`;
      const cor = ['0xC9A27E', '0x6B7F6A', '0x8C5A6E'][k];
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${cor}:s=360x640:d=4:r=24`, '-f', 'lavfi', '-i', 'testsrc=s=200x200:d=4:r=24', '-filter_complex', '[0][1]overlay=80:220', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(pasta, nome)]);
      const capa = `video-${k + 1}-capa.webp`;
      await writeFile(path.join(pasta, capa), await sharp({ create: { width: 360, height: 640, channels: 3, background: cor.replace('0x', '#') } }).webp({ quality: 60 }).toBuffer());
      urls.push({ url: `${PREFIXO_URL}/produtos/${F.PASTA_FOTOS}/${nome}`, capa: `${PREFIXO_URL}/produtos/${F.PASTA_FOTOS}/${capa}` });
    }
    const comVideo = ativos.filter((_, k) => k % 10 === 0).slice(0, 18);
    await db.produtoVideo.createMany({ data: comVideo.flatMap((p, k) => [{ produtoId: p.id, ...urls[k % 3], ordem: 0 }, ...(k % 4 === 0 ? [{ produtoId: p.id, ...urls[(k + 1) % 3], ordem: 1 }] : [])]) });
    const fixa = await db.produto.findUnique({ where: { referencia: 'FIX-ESTOQUE' }, select: { id: true } });
    if (fixa) await db.produtoVideo.create({ data: { produtoId: fixa.id, ...urls[0] } });
    log(`${await db.produtoVideo.count()} vídeos de produto`);
  } catch (e) {
    log(`vídeos pulados (ffmpeg indisponível: ${e instanceof Error ? e.message.split('\n')[0] : e})`);
  }

  // ---------- Histórico de importações da planilha de estoque ----------
  const imp = await db.produto.findMany({ where: { referencia: { startsWith: 'SEED-' } }, take: 30, select: { referencia: true, nome: true, preco: true, precoCheio: true } });
  for (let k = 0; k < 6; k++) {
    const quando = antes(150 - k * 25);
    const novos = imp.slice(k * 4, k * 4 + r.inteiro(0, 4));
    const resumo = {
      linhas: r.inteiro(800, 1400),
      totais: { pecasPlanilha: r.inteiro(3000, 5000), valorPlanilha: r.inteiro(250000, 420000), pecasSiteAntes: r.inteiro(2800, 4200), pecasSiteDepois: r.inteiro(2900, 4300) },
      fornecedores: [
        { nome: 'HERING DO BRASIL', marca: 'Hering', ignorar: false, novo: k === 0, skus: r.inteiro(600, 900), pecas: r.inteiro(2000, 3500) },
        { nome: 'DZARM CONFECCOES', marca: 'Dzarm', ignorar: false, novo: k === 0, skus: r.inteiro(80, 200), pecas: r.inteiro(300, 700) },
        { nome: 'BRINDES E EMBALAGENS', marca: 'Outros', ignorar: true, novo: false, skus: r.inteiro(5, 20), pecas: r.inteiro(50, 200) },
      ],
      marcasNovas: k === 0 ? ['Dzarm'] : [], categoriasNovas: k === 2 ? ['Pijamas'] : [],
      contagens: { produtosNovos: novos.length, variantesNovas: novos.length * 5, estoqueAlterado: r.inteiro(40, 300), precosAlterados: r.inteiro(0, 25), desativados: r.inteiro(0, 6), reativados: r.inteiro(0, 4), ignoradas: r.inteiro(0, 12), avisos: k % 2 },
      produtosNovos: novos.map(p => ({ referencia: p.referencia, nome: p.nome, marca: 'Hering', categoria: 'Camisetas', genero: 'feminino', preco: Number(p.preco), tamanhos: 'P, M, G, GG', pecas: r.inteiro(4, 30) })),
      estoque: imp.slice(0, 8).map(p => ({ nome: p.nome, tamanho: r.escolher(['P', 'M', 'G']), de: r.inteiro(0, 6), para: r.inteiro(0, 12) })),
      precos: imp.slice(10, 13).map(p => ({ referencia: p.referencia, nome: p.nome, preco: Number(p.preco), precoCheio: Number(p.precoCheio) })),
      desativados: imp.slice(20, 22).map(p => ({ referencia: p.referencia, nome: p.nome })),
      reativados: imp.slice(22, 23).map(p => ({ referencia: p.referencia, nome: p.nome })),
      ignoradas: [{ linha: 412, codigo: '000999', descricao: 'SACOLA PAPEL M', motivo: 'Fornecedor ignorado' }],
      avisos: k % 2 ? ['2 linhas sem preço de venda: ficaram com o preço atual.'] : [],
    };
    await db.importacaoEstoque.create({ data: { arquivo: `estoque-${randomBytes(6).toString('hex')}.xlsx`, nomeOriginal: `ESTOQUE ${quando.toISOString().slice(0, 10)}.xlsx`, usuarioId: k % 4 === 3 ? ids.supervisora : ids.gestor, resumo, criadoEm: quando } });
  }
  log('6 importações de estoque no histórico');

  // ---------- Acompanhamento da equipe: sessões, último acesso e ações (refeito a partir dos dados) ----------
  await db.sessaoEquipe.deleteMany();
  await db.atividadeEquipe.deleteMany();
  const sessoes: Prisma.SessaoEquipeCreateManyInput[] = [];
  const logins: Prisma.AtividadeEquipeCreateManyInput[] = [];
  for (const u of equipe) {
    const de = u.ativo ? 0 : 60;
    let ultimoFim = 0, ultimoLogin = 0;
    for (let d = de + 45; d >= de; d--) {
      const dia = new Date(agora - d * DIA);
      if (dia.getDay() === 0 || (u.papel === 'gestor' && dia.getDay() === 6) || r.chance(0.12)) continue;
      for (let s = r.inteiro(1, 3); s > 0; s--) {
        const inicio = new Date(dia.setHours(r.inteiro(8, 18), r.inteiro(0, 59), 0, 0));
        if (inicio.getTime() > agora) continue;
        const min = r.inteiro(4, 120);
        const fim = new Date(Math.min(agora, inicio.getTime() + min * 60_000));
        const aparelho = u.papel === 'gestor' ? r.escolher(['computador', 'computador', 'celular']) : r.escolher(APARELHOS);
        sessoes.push({ usuarioId: u.id, inicioEm: inicio, fimEm: fim, segundos: Math.round(((fim.getTime() - inicio.getTime()) / 1000) * (0.5 + r.proximo() * 0.5)), aparelho });
        if (s === 1) {
          logins.push({ usuarioId: u.id, tipo: 'login', aparelho, criadoEm: inicio });
          ultimoLogin = Math.max(ultimoLogin, inicio.getTime());
        }
        ultimoFim = Math.max(ultimoFim, fim.getTime());
      }
    }
    await db.user.update({ where: { id: u.id }, data: { ultimoLoginEm: ultimoLogin ? new Date(ultimoLogin) : null, ultimoAcessoEm: ultimoFim ? new Date(ultimoFim) : null } });
  }
  await db.sessaoEquipe.createMany({ data: sessoes });
  const acoes: Prisma.AtividadeEquipeCreateManyInput[] = [...logins];
  const acao = (usuarioId: string | null | undefined, tipo: AcaoEquipe, criadoEm: Date | null | undefined, extra: Partial<Prisma.AtividadeEquipeCreateManyInput> = {}) => {
    if (usuarioId && criadoEm) acoes.push({ usuarioId, tipo, criadoEm, aparelho: r.escolher(APARELHOS), ...extra });
  };
  const todosPedidos = await db.pedido.findMany({ include: { historico: { orderBy: { criadoEm: 'asc' } }, itens: { select: { quantidade: true } }, pagamentos: { select: { forma: true } } } });
  const desc = (p: (typeof todosPedidos)[number]) => `${p.nomeCliente || 'Consumidor final'} · ${p.codigo} · ${p.itens.reduce((a, i) => a + i.quantidade, 0)} peças`;
  for (const p of todosPedidos) {
    const extra = { clienteId: p.clienteId, pedidoId: p.id, valor: p.total, descricao: desc(p) };
    if (p.origem === 'vendedor') acao(p.vendedorId, 'pedido_criado', p.criadoEm, extra);
    if (p.origem === 'balcao') acao(p.vendedorId, p.pagamentos.length ? 'venda_caixa' : 'venda_balcao', p.confirmadoEm ?? p.criadoEm, { ...extra, descricao: `${desc(p)}${p.pagamentos.length ? ` · ${p.pagamentos.map(x => x.forma).join(' + ')}` : ''}` });
    else if (p.confirmadoEm) acao(p.vendedorId, 'pedido_confirmado', p.confirmadoEm, extra);
    for (const h of p.historico.filter(x => x.acao === 'editado')) acao(h.usuarioId, 'pedido_editado', h.criadoEm, extra);
    if (p.status === 'cancelado' && p.motivoCancelamento === 'equipe') acao(p.vendedorId, p.confirmadoEm ? 'venda_desfeita' : 'pedido_cancelado', p.canceladoEm, extra);
    if (p.codigoCupom && p.origem !== 'loja') acao(p.vendedorId, 'cupom_pedido', p.criadoEm, { ...extra, descricao: `${desc(p)} · ${p.codigoCupom}` });
  }
  for (const v of await db.venda.findMany({ where: { pedidoId: null }, include: { cliente: { select: { nome: true } } } }))
    acao(v.vendedorId, 'venda_manual', v.criadoEm, { clienteId: v.clienteId, valor: v.valor, descricao: `${v.cliente?.nome ?? 'Sem cliente'} · ${v.observacao ?? 'Venda manual'}` });
  for (const k of [3, 9, 15]) acao(vendedoras[k % vendedoras.length].id, 'venda_excluida', antes(k * 4), { valor: 120 + k * 10, descricao: 'Venda lançada em duplicidade' });
  for (const c of await db.cliente.findMany({ where: { userId: null, NOT: { telefone: '' } }, select: { id: true, nome: true, vendedorId: true, criadoEm: true } })) {
    acao(c.vendedorId, 'cliente_cadastrado', c.criadoEm, { clienteId: c.id, descricao: c.nome });
    if (r.chance(0.2)) acao(c.vendedorId, 'cliente_editado', new Date(c.criadoEm.getTime() + r.inteiro(1, 30) * DIA), { clienteId: c.id, descricao: c.nome });
    if (r.chance(0.5)) acao(c.vendedorId, 'whatsapp', antes(r.inteiro(0, 60), r.inteiro(0, 10)), { clienteId: c.id, descricao: c.nome, numeroId: numeroDe.get(c.vendedorId) });
    if (r.chance(0.08)) acao(c.vendedorId, 'cupom_enviado', antes(r.inteiro(0, 60)), { clienteId: c.id, descricao: `${c.nome} · DESCONTO30` });
    if (r.chance(0.06)) acao(c.vendedorId, 'convite_enviado', antes(r.inteiro(0, 90)), { clienteId: c.id, descricao: c.nome });
  }
  for (const s of await db.sugestao.findMany({ where: { NOT: { enviadaEm: null } }, include: { cliente: { select: { nome: true } }, _count: { select: { itens: true } } } }))
    acao(s.vendedorId, 'oferta_enviada', s.enviadaEm, { clienteId: s.clienteId, descricao: `${s.cliente.nome} · ${s.codigo} · ${s._count.itens} peças sugeridas` });
  for (const n of await db.numeroWhatsApp.findMany()) acao(n.criadoPorId ?? ids.gestor, 'numero_cadastrado', n.criadoEm, { numeroId: n.id, descricao: `${n.apelido} · ${n.telefone}` });
  for (const v of await db.vinculoNumero.findMany({ include: { usuario: { select: { name: true } } } })) {
    acao(v.vinculadoPorId ?? ids.gestor, 'numero_vinculado', v.inicioEm, { numeroId: v.numeroId, descricao: v.usuario.name });
    if (v.fimEm) acao(v.encerradoPorId ?? ids.gestor, 'numero_desvinculado', v.fimEm, { numeroId: v.numeroId, descricao: `${v.usuario.name} · ${v.motivoFim ?? ''}` });
  }
  for (const a of await db.atendimento.findMany({ include: { registros: true } })) {
    acao(a.responsavelId ?? ids.gestor, 'atendimento_criado', a.criadoEm, { clienteId: a.clienteId, descricao: `${a.codigo} · ${a.canal}` });
    for (const g of a.registros) {
      const tipo: AcaoEquipe | null = g.tipo === 'contato_whatsapp' || g.tipo === 'contato_direct' ? 'atendimento_contato' : g.tipo === 'transferencia' ? 'atendimento_encaminhado' : g.tipo === 'envio_peca' ? 'peca_enviada' : null;
      if (tipo) acao(g.usuarioId, tipo, g.criadoEm, { clienteId: a.clienteId, descricao: `${a.codigo}${g.texto ? ` · ${g.texto}` : ''}` });
    }
    if (a.fechadoEm) acao(a.responsavelId, 'atendimento_fechado', a.fechadoEm, { clienteId: a.clienteId, descricao: `${a.codigo} · ${a.etapa}` });
  }
  for (const c of await db.posVendaContato.findMany({ where: { NOT: { feitoEm: null }, resultado: { in: Object.keys(RESULTADOS_POS_VENDA) } } }))
    acao(c.usuarioId, 'pos_venda_feito', c.feitoEm, { clienteId: c.clienteId, pedidoId: c.pedidoId, descricao: `${c.tipo} · ${RESULTADOS_POS_VENDA[c.resultado!]}` });
  const agoraD = new Date(agora);
  const validas = acoes.filter(a => (a.criadoEm as Date) <= agoraD);
  for (let i = 0; i < validas.length; i += 1000) await db.atividadeEquipe.createMany({ data: validas.slice(i, i + 1000) });
  log(`${sessoes.length} sessões e ${validas.length} ações da equipe`);

  // ---------- Notificações (refeitas a partir dos dados, de cada tipo; as antigas já lidas) ----------
  await db.notificacao.deleteMany();
  const gestores = equipe.filter(u => u.papel === 'gestor').map(u => u.id);
  const notifs: Prisma.NotificacaoCreateManyInput[] = [];
  const notif = (para: string[], tipo: TipoNotificacao, quando: Date, titulo: string, texto: string | null, link: string | null, chave: string) => {
    if (quando.getTime() > agora) return;
    const idade = agora - quando.getTime();
    for (const usuarioId of new Set(para)) notifs.push({ usuarioId, tipo, titulo: titulo.slice(0, 140), texto, link, chave: `${chave}`.slice(0, 100), criadaEm: quando, lidaEm: idade > 2 * DIA && r.chance(0.85) ? new Date(quando.getTime() + r.inteiro(1, 30) * HORA) : null });
  };
  const recentes = todosPedidos.filter(p => agora - p.criadoEm.getTime() < 40 * DIA);
  for (const p of recentes) {
    if (p.origem === 'loja') notif([p.vendedorId, ...gestores], 'pedido_novo', p.criadoEm, `Novo pedido ${p.codigo} de ${p.nomeCliente}`, `${p.itens.length} peças · R$ ${Number(p.total).toFixed(2).replace('.', ',')}`, `/painel/pedidos/${p.id}`, `novo:${p.codigo}`);
    if (p.status === 'cancelado' && p.canceladoEm && p.motivoCancelamento !== 'equipe') notif([p.vendedorId], 'pedido_cancelado', p.canceladoEm, `Pedido ${p.codigo} cancelado`, p.motivoCancelamento === 'expirado' ? 'Passou do prazo sem confirmação.' : 'A cliente cancelou pela loja.', `/painel/pedidos/${p.id}`, `cancelado:${p.codigo}`);
    if (p.status === 'pendente' && agora - p.criadoEm.getTime() > 2 * DIA) notif([p.vendedorId], 'prazo_vencendo', new Date(p.criadoEm.getTime() + 5 * DIA), `${p.codigo} vence em 2 dias`, 'Confirme ou cancele antes que expire.', `/painel/pedidos/${p.id}`, `prazo:${p.codigo}`);
  }
  for (const s of await db.sugestao.findMany({ include: { cliente: { select: { nome: true } } } })) {
    if (s.vistaEm) notif([s.vendedorId], 'carrinho_visto', s.vistaEm, `${s.cliente.nome} abriu a sugestão ${s.codigo}`, 'Bom momento para chamar no WhatsApp.', `/painel/sugestoes/${s.id}`, `visto:${s.codigo}`);
    if (s.respondidaEm) notif([s.vendedorId], 'carrinho_respondido', s.respondidaEm, `${s.cliente.nome} respondeu a sugestão ${s.codigo}`, s.status === 'convertida' ? 'Virou pedido.' : 'Marcou peças e ainda está pensando.', `/painel/sugestoes/${s.id}`, `respondido:${s.codigo}`);
    if (['enviada', 'vista'].includes(s.status) && s.validaAte.getTime() - agora < 2 * DIA && s.validaAte.getTime() > agora) notif([s.vendedorId], 'carrinho_vencendo', antes(0, 3), `Sugestão ${s.codigo} vence amanhã`, s.cliente.nome, `/painel/sugestoes/${s.id}`, `vencendo:${s.codigo}`);
  }
  for (const sac of await db.sacolaCliente.findMany({ where: { NOT: { avisadoEm: null } }, include: { cliente: { select: { id: true, nome: true, vendedorId: true } } } }))
    notif([sac.cliente.vendedorId], 'sacola_parada', sac.avisadoEm!, `${sac.cliente.nome} deixou peças na sacola`, 'A sacola está parada há mais de 24 horas.', `/painel/clientes/${sac.cliente.id}`, `sacola:${sac.cliente.id}`);
  for (const v of await db.variante.findMany({ where: { estoque: 0, produto: { ativo: true } }, take: 25, include: { produto: { select: { id: true, nome: true } } } }))
    notif(gestores, 'peca_esgotada', antes(r.inteiro(0, 30)), `${v.produto.nome} (tam. ${v.tamanho}) esgotou`, null, `/painel/produtos/${v.produto.id}`, `esgotou:${v.id}`);
  for (const v of vendedoras.slice(0, 3)) notif([v.id, ...gestores], 'meta_batida', antes(r.inteiro(1, 25)), `${v.name} bateu a meta do mês 🎉`, null, `/painel/vendedores/${v.id}`, `meta:${v.id}`);
  for (const c of novasComConta.slice(0, 20)) {
    const ficha = await db.cliente.findUniqueOrThrow({ where: { id: c.id }, select: { criadoEm: true } });
    notif([c.vendedorId], 'cliente_nova', ficha.criadoEm, `${c.nome} se cadastrou na loja`, 'Dê as boas-vindas pelo WhatsApp.', `/painel/clientes/${c.id}`, `nova:${c.id}`);
  }
  notif(gestores, 'numero_alterado', antes(1), 'Linha das lives aguardando conexão', 'Confirme quando o aparelho estiver conectado.', '/painel/numeros', `numero:${live.id}`);
  notif([ids.carlos, ...gestores], 'numero_alterado', antes(100), 'Reserva: vínculo de Carlos encerrado', 'Troca de aparelho.', '/painel/numeros', `numero:${reserva.id}:fim`);
  for (const a of await db.atendimento.findMany({ where: { criadoEm: { gte: antes(30) } } })) {
    notif(a.responsavelId ? [a.responsavelId] : gestores, 'atendimento_novo', a.criadoEm, `Novo atendimento ${a.codigo}`, `Pelo canal ${a.canal}.`, `/painel/atendimento/${a.id}`, `at:${a.codigo}`);
    if (a.proximoContatoEm && !a.fechadoEm && a.proximoContatoEm.getTime() < agora) notif(a.responsavelId ? [a.responsavelId] : gestores, 'retorno_vencendo', a.proximoContatoEm, `Retorno de ${a.codigo} é hoje`, null, `/painel/atendimento/${a.id}`, `retorno:${a.codigo}`);
  }
  const hoje = await db.posVendaContato.findMany({ where: { feitoEm: null, venceEm: { lte: depois(0, 2) } }, include: { cliente: { select: { nome: true, vendedorId: true } } }, take: 40 });
  for (const c of hoje) notif([c.cliente.vendedorId], 'pos_venda_hoje', new Date(Math.min(agora - HORA, c.venceEm.getTime())), `Pós-venda: falar com ${c.cliente.nome}`, `Contato de ${c.tipo}.`, '/painel/atendimento', `posvenda:${c.id}`);
  for (const c of await db.cobranca.findMany({ where: { status: { in: ['aprovada', 'recusada', 'estornada', 'contestada'] } }, include: { pedido: { select: { id: true, codigo: true, vendedorId: true, nomeCliente: true } } } })) {
    const ok = c.status === 'aprovada';
    notif([c.pedido.vendedorId, ...gestores], ok ? 'pagamento_aprovado' : 'pagamento_problema', c.aprovadaEm ?? c.criadaEm, ok ? `Pagamento aprovado: ${c.pedido.codigo}` : `Problema no pagamento de ${c.pedido.codigo}`, `${c.pedido.nomeCliente} · ${c.status}${c.semEstoque ? ' · peça sem estoque' : ''}`, `/painel/pedidos/${c.pedido.id}`, `pg:${c.id}`);
  }
  for (let i = 0; i < notifs.length; i += 1000) await db.notificacao.createMany({ data: notifs.slice(i, i + 1000), skipDuplicates: true });
  // Preferências: quem desligou algum tipo no painel ou no e-mail.
  await db.user.update({ where: { id: ids.carlos }, data: { preferenciasNotificacao: { painel: ['sacola_parada'], email: ['pedido_novo', 'carrinho_visto'] } } });
  await db.user.update({ where: { id: ids.supervisora }, data: { preferenciasNotificacao: { painel: [], email: ['peca_esgotada'] } } });
  log(`${await db.notificacao.count()} notificações`);

  // ---------- Sessões de login e verificações (Better Auth): antigas e vencidas ----------
  await db.session.createMany({
    data: equipe.flatMap(u => [0, 1].map(k => ({ token: randomBytes(24).toString('base64url'), userId: u.id, expiresAt: antes(k ? 40 : 2), createdAt: antes(k ? 47 : 9), updatedAt: antes(k ? 47 : 9), ipAddress: null, userAgent: k ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }))),
  });
  await db.verification.createMany({
    data: novasComConta.slice(0, 6).map((c, k) => ({ identifier: `reset-password:${randomBytes(16).toString('hex')}`, value: c.userId, expiresAt: antes(k + 1), createdAt: antes(k + 1, 1), updatedAt: antes(k + 1, 1) })),
  });

  invalidarCatalogo();
  const tabelas = await db.$queryRaw<{ TABLE_NAME: string; TABLE_ROWS: bigint }[]>`SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  conta('tabelas', tabelas.length);
  return { ids, clienteIds, contagemDemo };
}
