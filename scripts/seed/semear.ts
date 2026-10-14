/**
 * Seed completo e determinístico para testes: popula todas as tabelas com todas as variações de estado.
 * Usa as regras do próprio sistema (criarPedido, confirmarPedido, cancelarPedido, movimentar) para que estoque,
 * reservas, vendas, custos e histórico fiquem coerentes entre si, como em uso real.
 *
 * Chamado por scripts/seed-completo.ts (linha de comando) e pela preparação dos testes de integração.
 * APAGA todos os dados do banco antes de semear: só roda em banco de teste (ver garantirBancoDeTeste).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Prisma, type Estacao, type Genero, type PrismaClient } from '@prisma/client';
import { criarConta } from '../../src/server/contas';
import { DIR_ARQUIVOS, PREFIXO_URL } from '../../src/server/arquivos';
import { cancelarPedido, confirmarPedido, criarPedido, type MotivoCancelamento } from '../../src/server/pedidos';
import { movimentar } from '../../src/server/estoque';
import { invalidarCatalogo } from '../../src/server/catalogo';
import { mesDe, somarMeses } from '../../src/lib/datas';
import { posicaoTamanho } from '../../src/lib/catalogo';
import { formatarTelefone } from '../../src/lib/telefone';
import * as F from './fixtures';

/** Gerador pseudoaleatório com semente: o mesmo seed gera sempre os mesmos dados. */
export function gerador(semente = 2026) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1));
  const escolher = <T>(xs: readonly T[]) => xs[Math.floor(proximo() * xs.length)];
  const chance = (p: number) => proximo() < p;
  return { proximo, inteiro, escolher, chance };
}

/** Recusa qualquer banco que não seja de teste: o seed apaga tudo. */
export function garantirBancoDeTeste(url = process.env.DATABASE_URL ?? '') {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('DATABASE_URL inválida.');
  }
  const banco = u.pathname.replace(/^\//, '');
  const local = ['localhost', '127.0.0.1', 'mysql'].includes(u.hostname);
  if (process.env.NODE_ENV === 'production' || !local || !(banco.startsWith('test_') || process.env.SEED_PERMITIDO === '1'))
    throw new Error(`Seed completo só roda em banco local de teste (nome começando com test_ ou SEED_PERMITIDO=1). Banco: ${banco}`);
  return banco;
}

const DIA = 864e5;

/** Apaga os dados de todas as tabelas, na ordem das chaves estrangeiras. */
export async function limparBanco(db: PrismaClient) {
  await db.$transaction([
    db.movimentoEstoque.deleteMany(),
    db.venda.deleteMany(),
    db.pedidoItem.deleteMany(),
    db.pedido.deleteMany(),
    db.custo.deleteMany(),
    db.produtoImagem.deleteMany(),
    db.variante.deleteMany(),
    db.produto.deleteMany(),
    db.categoria.deleteMany(),
    db.marca.deleteMany(),
    db.meta.deleteMany(),
    db.cliente.deleteMany(),
    db.session.deleteMany(),
    db.account.deleteMany(),
    db.verification.deleteMany(),
    db.user.deleteMany(),
    db.configuracao.deleteMany(),
    db.contador.deleteMany(),
  ]);
}

/** Fotos geradas (cores sólidas com faixa), compartilhadas pelos produtos: nada é baixado da internet. */
async function gerarFotos(n: number) {
  const pasta = path.join(DIR_ARQUIVOS, 'produtos', F.PASTA_FOTOS);
  await mkdir(pasta, { recursive: true });
  const urls: string[] = [];
  for (let i = 0; i < n; i++) {
    const cor = { r: (i * 67) % 256, g: (i * 131 + 80) % 256, b: (i * 199 + 40) % 256 };
    const faixa = await sharp({ create: { width: 300, height: 60, channels: 3, background: { r: 245, g: 240, b: 230 } } }).png().toBuffer();
    const foto = await sharp({ create: { width: 300, height: 400, channels: 3, background: cor } })
      .composite([{ input: faixa, top: 300, left: 0 }])
      .webp({ quality: 60 })
      .toBuffer();
    const nome = `foto-${String(i + 1).padStart(2, '0')}.webp`;
    await writeFile(path.join(pasta, nome), foto);
    urls.push(`${PREFIXO_URL}/produtos/${F.PASTA_FOTOS}/${nome}`);
  }
  return urls;
}

type Resumo = Record<string, number>;

export async function semear(db: PrismaClient, opcoes: { senha: string; log?: (m: string) => void }) {
  const log = opcoes.log ?? (() => {});
  const { senha } = opcoes;
  if (senha.length < 8) throw new Error('A senha do seed precisa ter pelo menos 8 caracteres.');
  garantirBancoDeTeste();
  const r = gerador(2026);
  const agora = Date.now();
  const mesAtual = mesDe();

  await limparBanco(db);
  invalidarCatalogo();
  log('banco limpo');

  // ---------- Equipe ----------
  const ids: Record<string, string> = {};
  for (const p of F.EQUIPE) {
    const u = await criarConta(db, { nome: p.nome, email: p.email, senha, papel: p.papel, telefone: p.telefone });
    ids[p.chave] = u.id;
    if (p.ativo === false) await db.user.update({ where: { id: u.id }, data: { ativo: false } });
  }
  const vendedoresAtivos = F.EQUIPE.filter(p => p.papel === 'vendedor' && p.ativo !== false).map(p => ids[p.chave]);
  log(`${F.EQUIPE.length} pessoas na equipe`);

  // Metas: últimos 6 meses + o atual, com exceções de propósito (sem meta; só meta antiga; meta zero).
  const metas: { vendedorId: string; mes: string; valor: number }[] = [];
  for (const p of F.EQUIPE.filter(x => x.papel === 'vendedor')) {
    if (p.meta === 'nenhuma') continue;
    for (let k = -6; k <= 0; k++) {
      if (p.meta === 'antiga' && k > -3) continue; // vale a de 3 meses atrás (metasDoMes usa a mais recente anterior)
      metas.push({ vendedorId: ids[p.chave], mes: somarMeses(mesAtual, k), valor: p.meta === 'zero' ? 0 : 8000 + 1000 * r.inteiro(0, 10) });
    }
  }
  await db.meta.createMany({ data: metas });

  // ---------- Configurações ----------
  await db.configuracao.createMany({
    data: [
      { chave: 'whatsappLoja', valor: F.WHATSAPP_LOJA },
      { chave: 'cepsCondicional', valor: F.CEPS_CONDICIONAL },
      { chave: 'cidadeCondicional', valor: 'Maravilha/SC' },
      { chave: 'frete', valor: Prisma.JsonNull },
      { chave: 'parcelas', valor: 0 },
      { chave: 'diasExpiracao', valor: 7 },
      { chave: 'catalogoPublico', valor: false },
      { chave: 'vendedorPadraoId', valor: ids.ana },
    ],
  });

  // ---------- Clientes ----------
  const clienteIds: Record<string, string> = {};
  for (const c of F.CLIENTES_COM_CONTA) {
    const u = await criarConta(db, { nome: c.nome, email: c.email, senha, papel: 'cliente', telefone: c.telefone, aceitouPrivacidadeEm: c.aceitou ? new Date(agora - 30 * DIA) : undefined });
    const cli = await db.cliente.create({
      data: { userId: u.id, vendedorId: ids[c.vendedor], nome: c.nome, telefone: c.telefone, email: c.email, endereco: c.endereco ?? null, cidade: c.cidade ?? null, cep: c.cep ?? null, preferencias: c.preferencias ?? null },
    });
    clienteIds[c.chave] = cli.id;
  }
  const semConta: { vendedorId: string; nome: string; telefone: string; email: string | null; endereco: string | null; cidade: string | null; cep: string | null; preferencias: string | null; criadoEm: Date }[] = [];
  for (let i = 0; i < F.QTD_CLIENTES_SEM_CONTA; i++) {
    const nome = `${F.NOMES[i % F.NOMES.length]} ${F.SOBRENOMES[(i * 7) % F.SOBRENOMES.length]}${i >= F.NOMES.length ? ` ${F.SOBRENOMES[(i * 3 + 1) % F.SOBRENOMES.length]}` : ''}`;
    const cidade = r.chance(0.8) ? r.escolher(F.CIDADES) : null;
    semConta.push({
      vendedorId: vendedoresAtivos[i % vendedoresAtivos.length],
      nome,
      telefone: formatarTelefone(`499${String(80000000 + i * 1373).slice(0, 8)}`),
      email: r.chance(0.4) ? `${nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@exemplo.com` : null,
      endereco: r.chance(0.5) ? `Rua ${r.escolher(F.SOBRENOMES)}, ${r.inteiro(10, 999)}` : null,
      cidade,
      cep: cidade === 'Maravilha' ? r.escolher(F.CEPS_CONDICIONAL) : r.chance(0.3) ? '89900-000' : null,
      preferencias: r.chance(0.5) ? `${r.escolher(['Camisetas', 'Vestidos', 'Moletons', 'Calças', 'Fitness'])} · Tam. ${r.escolher(['P', 'M', 'G', 'GG'])}` : null,
      criadoEm: new Date(agora - r.inteiro(1, 200) * DIA),
    });
  }
  await db.cliente.createMany({ data: semConta });
  for (const c of F.CLIENTES_FIXOS_SEM_CONTA) {
    const cli = await db.cliente.create({ data: { vendedorId: ids[c.vendedor], nome: c.nome, telefone: c.telefone, cidade: c.cidade ?? null, preferencias: c.preferencias ?? null } });
    clienteIds[c.chave] = cli.id;
  }
  // Fichas anonimizadas (cliente que excluiu a conta, B-11): ficam fora das listas.
  for (let i = 0; i < F.QTD_CLIENTES_REMOVIDOS; i++)
    await db.cliente.create({ data: { vendedorId: vendedoresAtivos[i % vendedoresAtivos.length], nome: 'Cliente removido', telefone: '' } });
  log(`${F.CLIENTES_COM_CONTA.length + F.QTD_CLIENTES_SEM_CONTA + F.CLIENTES_FIXOS_SEM_CONTA.length + F.QTD_CLIENTES_REMOVIDOS} clientes`);

  // ---------- Catálogo ----------
  const fotos = await gerarFotos(F.QTD_FOTOS);
  const marcas = new Map<string, number>();
  for (const m of F.MARCAS) marcas.set(m.slug, (await db.marca.create({ data: m })).id);
  const categorias = new Map<string, { id: number; nome: string; tamanhos: readonly string[] }>();
  for (const c of F.CATEGORIAS) categorias.set(c.slug, { id: (await db.categoria.create({ data: { nome: c.nome, slug: c.slug } })).id, nome: c.nome, tamanhos: c.tamanhos });

  const produtos = F.gerarProdutos();
  let codigo = 10000;
  for (const [i, p] of produtos.entries()) {
    const cat = categorias.get(p.categoria)!;
    const criado = await db.produto.create({
      data: {
        referencia: p.referencia, nome: p.nome, marcaId: marcas.get(p.marca)!, categoriaId: cat.id, subcategoria: p.subcategoria ?? null,
        genero: p.genero as Genero, estacao: (p.estacao ?? null) as Estacao | null, cor: p.cor, composicao: p.composicao, descricao: p.descricao,
        destaques: p.destaques, preco: p.preco, precoCheio: p.precoCheio, imperdivel: p.imperdivel, ativo: p.ativo,
        criadoEm: new Date(agora - (produtos.length - i) * DIA / 2),
      },
    });
    if (p.fotos > 0)
      await db.produtoImagem.createMany({ data: Array.from({ length: p.fotos }, (_, k) => ({ produtoId: criado.id, url: fotos[(i * 3 + k) % fotos.length], ordem: k })) });
    if (p.custo != null) await db.custo.create({ data: { produtoId: criado.id, valor: p.custo } });
    for (const t of p.tamanhos) {
      const estoque = p.estoque(t);
      const v = await db.variante.create({
        data: { produtoId: criado.id, tamanho: t, ordem: posicaoTamanho(t), estoque: 0, codigoInterno: String(codigo++), ean: i % 3 === 0 ? `789${String(codigo).padStart(10, '0')}` : null },
      });
      // Saldo inicial pelo módulo de estoque (gera o histórico como no uso real).
      if (estoque > 0) await db.$transaction(tx => movimentar(tx, { varianteId: v.id, tipo: 'entrada', quantidade: estoque, usuarioId: ids.gestor, observacao: 'Saldo inicial (seed)' }));
    }
  }
  // Algumas contagens (ajuste) para o histórico ter os dois tipos.
  const paraAjuste = await db.variante.findMany({ where: { estoque: { gt: 3 }, produto: { referencia: { startsWith: 'SEED-' } } }, take: 40, orderBy: { id: 'asc' } });
  for (const v of paraAjuste.filter((_, k) => k % 4 === 0))
    await db.$transaction(tx => movimentar(tx, { varianteId: v.id, tipo: 'ajuste', quantidade: v.estoque - 1, usuarioId: ids.gestor, observacao: 'Contagem (seed)' }));
  invalidarCatalogo();
  log(`${produtos.length} produtos, ${fotos.length} fotos`);

  // ---------- Pedidos ----------
  // Só peças do catálogo gerado (SEED-), para não mexer no estoque das peças fixas usadas pelos testes ponta a ponta.
  const varianteDisponivel = async () =>
    db.variante.findMany({ where: { produto: { ativo: true, referencia: { startsWith: 'SEED-' } } }, select: { id: true, estoque: true, reservado: true } });
  const clientes = await db.cliente.findMany({ where: { NOT: { telefone: '' }, OR: [{ userId: null }, { id: { in: [clienteIds.mariana, clienteIds.carlosCliente] } }] }, select: { id: true, nome: true, telefone: true, vendedorId: true, cep: true, userId: true } });
  const vendedorAtivo = new Set(vendedoresAtivos);
  const clientesComVendedorAtivo = clientes.filter(c => vendedorAtivo.has(c.vendedorId));
  const regraFrete = { valor: 24.9, gratisAcima: 299 };
  const estat: Resumo = {};
  const conta = (k: string) => (estat[k] = (estat[k] ?? 0) + 1);

  for (let i = 0; i < F.QTD_PEDIDOS; i++) {
    const cli = r.escolher(clientesComVendedorAtivo);
    const disponiveis = (await varianteDisponivel()).filter(v => v.estoque - v.reservado > 0);
    if (!disponiveis.length) break;
    const n = r.inteiro(1, 4);
    const linhas = Array.from({ length: n }, () => {
      const v = r.escolher(disponiveis);
      return { varianteId: v.id, quantidade: Math.min(v.estoque - v.reservado, r.chance(0.2) ? 2 : 1) };
    });
    const condicional = r.chance(0.35);
    const origem = r.chance(0.6) ? 'loja' : r.chance(0.75) ? 'vendedor' : 'balcao';
    const tipo = origem === 'balcao' ? 'compra' : condicional ? 'condicional' : 'compra';
    let p;
    try {
      p = await criarPedido({
        tipo, origem, clienteId: cli.id, vendedorId: cli.vendedorId, nomeCliente: cli.nome, telefoneCliente: cli.telefone,
        cep: tipo === 'condicional' ? (cli.cep ?? F.CEPS_CONDICIONAL[0]) : null, linhas,
        regraFrete: origem === 'loja' && tipo === 'compra' && r.chance(0.5) ? regraFrete : null,
        usuarioId: origem === 'loja' ? cli.userId : cli.vendedorId,
      });
    } catch {
      continue; // peça disputada no sorteio: segue
    }
    // Datas espalhadas nos últimos ~6 meses; pendentes ficam nos últimos 4 dias (não expiram durante os testes).
    const destino = origem === 'balcao' ? 'confirmado' : r.chance(0.18) ? 'pendente' : r.chance(0.78) ? 'confirmado' : 'cancelado';
    const quando = destino === 'pendente' ? new Date(agora - r.inteiro(1, 96) * 36e5) : new Date(agora - r.inteiro(1, 180) * DIA - r.inteiro(0, 23) * 36e5);
    const usuario = cli.vendedorId;
    if (destino === 'confirmado') {
      const itens = await db.pedidoItem.findMany({ where: { pedidoId: p.id } });
      // Condicional: às vezes fica tudo, às vezes nada, às vezes parte (B-13).
      const ficaram = Object.fromEntries(itens.map(it => [it.id, tipo === 'condicional' ? r.inteiro(0, it.quantidade) : it.quantidade]));
      await confirmarPedido(p.id, ficaram, usuario);
      const fechado = new Date(quando.getTime() + r.inteiro(1, 72) * 36e5);
      await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando, confirmadoEm: fechado } });
      await db.venda.updateMany({ where: { pedidoId: p.id }, data: { data: fechado, criadoEm: fechado } });
      await db.movimentoEstoque.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: fechado } });
      await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: fechado } });
      await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id, acao: 'criado' }, data: { criadoEm: quando } });
    } else if (destino === 'cancelado') {
      const motivo = r.escolher<MotivoCancelamento>(['equipe', 'cliente', 'expirado']);
      await cancelarPedido(p.id, motivo, motivo === 'cliente' ? cli.userId : motivo === 'equipe' ? usuario : null);
      const cancelado = new Date(quando.getTime() + r.inteiro(1, 9) * DIA);
      await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando, canceladoEm: cancelado } });
      await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: cancelado } });
      await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id, acao: 'criado' }, data: { criadoEm: quando } });
    } else {
      await db.pedido.update({ where: { id: p.id }, data: { criadoEm: quando } });
      await db.pedidoHistorico.updateMany({ where: { pedidoId: p.id }, data: { criadoEm: quando } });
    }
    conta(`${tipo}/${origem}/${destino}`);
  }
  log(`pedidos: ${JSON.stringify(estat)}`);

  // ---------- Vendas manuais (loja física, só valor) ----------
  const manuais = Array.from({ length: F.QTD_VENDAS_MANUAIS }, () => {
    const cli = r.chance(0.85) ? r.escolher(clientesComVendedorAtivo) : null;
    const data = new Date(agora - r.inteiro(0, 180) * DIA - r.inteiro(0, 10) * 36e5);
    return {
      vendedorId: cli?.vendedorId ?? r.escolher(vendedoresAtivos), clienteId: cli?.id ?? null, valor: r.inteiro(40, 900) + r.escolher([0, 0.9, 0.5]),
      data, criadoEm: data, observacao: r.chance(0.7) ? 'Venda na loja' : r.escolher(['Pagamento no Pix', 'Cartão 3x', 'Troca + diferença']),
    };
  });
  await db.venda.createMany({ data: manuais });

  // ---------- Fixtures fixas dos testes ponta a ponta ----------
  await F.semearFixasPedidos(db, { ids, clienteIds, criarPedido, confirmarPedido, cancelarPedido });
  invalidarCatalogo();

  const contagem = {
    usuarios: await db.user.count(), clientes: await db.cliente.count(), metas: await db.meta.count(), produtos: await db.produto.count(),
    variantes: await db.variante.count(), imagens: await db.produtoImagem.count(), custos: await db.custo.count(), movimentos: await db.movimentoEstoque.count(),
    pedidos: await db.pedido.count(), itens: await db.pedidoItem.count(), vendas: await db.venda.count(), configuracoes: await db.configuracao.count(),
  };
  log(`pronto: ${JSON.stringify(contagem)}`);
  return { ids, clienteIds, contagem };
}
