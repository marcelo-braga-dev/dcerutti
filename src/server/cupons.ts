import 'server-only';
import { Prisma } from '@prisma/client';
import { ErroNegocio } from './erros';
import { COM_ALVOS, regraDe } from './consultas/cupons';
import { avaliarCupom, normalizarCodigo, type ContextoCupom, type PecaCupom } from '@/lib/cupom';
import { brl } from '@/lib/dinheiro';
import { somenteDigitos } from '@/lib/telefone';

/**
 * Cupom dentro da transação do pedido (docs/20-cupons.md). Quem chama abre a transação; aqui o cupom é conferido
 * com a linha dele travada, e o desconto é gravado nas peças e no pedido.
 */
type Tx = Prisma.TransactionClient;
type RegraFrete = { valor: number; gratisAcima: number } | null;

/** Busca pelo código. `travar`: segura a linha do cupom até o commit, para dois pedidos não passarem juntos do limite. */
export async function buscarCupom(tx: Tx, codigo: string, travar = false) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return null;
  if (travar) await tx.$queryRaw`SELECT id FROM cupom WHERE codigo = ${cod} FOR UPDATE`;
  return tx.cupom.findUnique({ where: { codigo: cod }, include: COM_ALVOS });
}

/** Fichas da mesma pessoa: o telefone não é único entre as fichas, então limite por cliente e primeira compra olham todas. */
async function fichasDaPessoa(tx: Tx, clienteId: string) {
  const c = await tx.cliente.findUnique({ where: { id: clienteId }, select: { telefone: true } });
  if (!c?.telefone) return [clienteId];
  const ids = (await tx.cliente.findMany({ where: { telefone: { in: [c.telefone, somenteDigitos(c.telefone)] } }, select: { id: true } })).map(x => x.id);
  return [...new Set([clienteId, ...ids])];
}

/**
 * Usos do cupom (pedidos não cancelados, sem contar `ignorarPedidoId`) e se a pessoa já comprou.
 * Leitura com trava (LOCK IN SHARE MODE): lê o que já foi gravado por outra transação, e não a "foto" do começo desta.
 * Junto com a trava da linha do cupom, é o que impede dois pedidos de passarem juntos do limite.
 */
export async function contextoDoCupom(tx: Tx, cupomId: number, clienteId: string, ignorarPedidoId?: string) {
  const fichas = await fichasDaPessoa(tx, clienteId);
  const ignorar = ignorarPedidoId ?? '';
  const [[total], [daPessoa], vendas] = await Promise.all([
    tx.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM pedido WHERE cupomId = ${cupomId} AND status <> 'cancelado' AND id <> ${ignorar} LOCK IN SHARE MODE`,
    tx.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM pedido WHERE cupomId = ${cupomId} AND status <> 'cancelado' AND id <> ${ignorar} AND clienteId IN (${Prisma.join(fichas)}) LOCK IN SHARE MODE`,
    tx.venda.count({ where: { clienteId: { in: fichas } } }),
  ]);
  return { usosTotal: Number(total.n), usosCliente: Number(daPessoa.n), jaComprou: vendas > 0 };
}

/** Peças no formato da regra, com categoria, marca e promoção do produto de agora. */
export async function pecasDoCupom<K>(tx: Tx, linhas: { chave: K; produtoId: number; preco: number; quantidade: number }[]): Promise<PecaCupom<K>[]> {
  const produtos = new Map(
    (await tx.produto.findMany({ where: { id: { in: linhas.map(l => l.produtoId) } }, select: { id: true, categoriaId: true, marcaId: true, preco: true, precoCheio: true, imperdivel: true } }))
      .map(p => [p.id, p]),
  );
  return linhas.map(l => {
    const p = produtos.get(l.produtoId);
    return {
      chave: l.chave, produtoId: l.produtoId, categoriaId: p?.categoriaId ?? 0, marcaId: p?.marcaId ?? 0,
      emPromocao: !!p && (p.imperdivel || Number(p.precoCheio) > Number(p.preco)), preco: l.preco, quantidade: l.quantidade,
    };
  });
}

const freteDaRegra = (tipo: string, regra: RegraFrete, pecas: Prisma.Decimal) =>
  tipo !== 'compra' || !regra ? null : regra.gratisAcima > 0 && pecas.gte(regra.gratisAcima) ? new Prisma.Decimal(0) : new Prisma.Decimal(regra.valor);

/**
 * Aplica (`codigo`), recalcula (sem `codigo`, se o pedido já tem cupom) ou retira o cupom do pedido, e grava o desconto
 * nas peças, o total (peças − cupom) e o frete. Devolve a frase para o histórico, ou null se nada mudou.
 * - Aplicar: confere todas as regras; recusado, lança o motivo (o pedido não é gravado).
 * - Recalcular: só conta, mínimo e abrangência; se deixar de valer, o cupom sai do pedido e a frase diz por quê.
 * `somenteVendidos`: fechamento do condicional, o cupom vale só sobre o que ficou.
 */
export async function cupomNoPedido(
  tx: Tx,
  pedidoId: string,
  o: { codigo?: string; quem: 'cliente' | 'equipe'; regraFrete: RegraFrete; somenteVendidos?: boolean; retirar?: boolean },
): Promise<string | null> {
  const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: true } });
  const linhas = pedido.itens.filter(i => (o.somenteVendidos ? i.situacao === 'vendido' : i.situacao !== 'devolvido'));
  const pecas = linhas.reduce((a, i) => a.add(i.precoUnitario.mul(i.quantidade)), new Prisma.Decimal(0));
  // O total do pedido é sempre todas as linhas − o cupom (no condicional fechado, as devolvidas ficam com desconto 0).
  const todas = pedido.itens.reduce((a, i) => a.add(i.precoUnitario.mul(i.quantidade)), new Prisma.Decimal(0));
  const freteSemCupom = pedido.freteCupom ? freteDaRegra(pedido.tipo, o.regraFrete, pecas) : pedido.frete;

  const retirar = async (frase: string | null) => {
    if (!pedido.cupomId && !pedido.descontoCupom.gt(0) && !pedido.freteCupom) return null;
    await tx.pedidoItem.updateMany({ where: { pedidoId }, data: { descontoCupom: 0 } });
    await tx.pedido.update({ where: { id: pedidoId }, data: { cupomId: null, codigoCupom: null, descontoCupom: 0, freteCupom: false, total: todas, frete: freteSemCupom } });
    return frase;
  };

  if (o.retirar) return retirar(`Cupom ${pedido.codigoCupom} retirado`);
  const novo = o.codigo != null;
  const cupom = novo ? await buscarCupom(tx, o.codigo!, true) : pedido.cupomId ? await tx.cupom.findUnique({ where: { id: pedido.cupomId }, include: COM_ALVOS }) : null;
  if (novo && !cupom) throw new ErroNegocio('Cupom não encontrado.');
  if (!cupom) return retirar(pedido.codigoCupom ? `Cupom ${pedido.codigoCupom} retirado: ele não existe mais` : null);

  const ctx: ContextoCupom = {
    agora: new Date(), quem: o.quem, clienteId: pedido.clienteId, tipoPedido: pedido.origem === 'balcao' ? 'balcao' : pedido.tipo,
    ...(novo ? await contextoDoCupom(tx, cupom.id, pedido.clienteId, pedidoId) : { usosTotal: 0, usosCliente: 0, jaComprou: false, jaAplicado: true }),
  };
  const r = avaliarCupom(regraDe(cupom), await pecasDoCupom(tx, linhas.map(i => ({ chave: i.id, produtoId: i.produtoId, preco: Number(i.precoUnitario), quantidade: i.quantidade }))), ctx);
  if (!r.ok) {
    if (novo) throw new ErroNegocio(r.mensagem);
    return retirar(`Cupom ${cupom.codigo} retirado: ${r.mensagem}`);
  }

  const porLinha = new Map(r.descontos.map(d => [d.chave, d.valor]));
  for (const i of pedido.itens) {
    const valor = porLinha.get(i.id) ?? 0;
    if (Number(i.descontoCupom) !== valor) await tx.pedidoItem.update({ where: { id: i.id }, data: { descontoCupom: valor } });
  }
  const desconto = new Prisma.Decimal(r.desconto.toFixed(2));
  await tx.pedido.update({
    where: { id: pedidoId },
    data: { cupomId: cupom.id, codigoCupom: cupom.codigo, descontoCupom: desconto, freteCupom: r.freteGratis, total: todas.sub(desconto), frete: r.freteGratis ? new Prisma.Decimal(0) : freteSemCupom },
  });

  const efeito = r.freteGratis ? 'frete grátis' : `−${brl(r.desconto)}`;
  if (novo) return `Cupom ${cupom.codigo} aplicado (${efeito})`;
  if (!r.freteGratis && !desconto.eq(pedido.descontoCupom)) return `Cupom ${cupom.codigo}: desconto de ${brl(Number(pedido.descontoCupom))} para ${brl(r.desconto)}`;
  return null;
}
