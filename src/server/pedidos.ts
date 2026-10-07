import 'server-only';
import { Prisma, type TipoPedido, type OrigemPedido } from '@prisma/client';
import { db } from './db';
import { invalidarCatalogo } from './catalogo';
import { ErroNegocio } from './erros';
import { baixarVenda, liberarReserva, reservar } from './estoque';
import type { ItemMensagem } from '@/lib/whatsapp';

type Tx = Prisma.TransactionClient;

export class ErroPedido extends ErroNegocio {}

export type LinhaPedido = { varianteId: number; quantidade: number };

/** Junta linhas repetidas e limita quantidades absurdas. */
export function normalizarLinhas(linhas: LinhaPedido[]): LinhaPedido[] {
  const m = new Map<number, number>();
  for (const l of linhas) {
    const q = Math.floor(Number(l.quantidade));
    if (!Number.isInteger(l.varianteId) || !(q > 0)) continue;
    m.set(l.varianteId, (m.get(l.varianteId) ?? 0) + q);
  }
  if (!m.size) throw new ErroPedido('A sacola está vazia.');
  if (m.size > 40) throw new ErroPedido('Pedido com peças demais. Divida em mais de um pedido.');
  return [...m].map(([varianteId, quantidade]) => ({ varianteId, quantidade: Math.min(quantidade, 20) }));
}

/** RN-05: código sequencial e único, gerado dentro da transação (a linha do contador fica travada até o commit). */
async function proximoCodigo(tx: Tx, tipo: TipoPedido) {
  const nome = tipo === 'condicional' ? 'COND' : 'PED';
  const c = await tx.contador.upsert({ where: { nome }, create: { nome, valor: 1 }, update: { valor: { increment: 1 } } });
  return `${nome}-${String(c.valor).padStart(6, '0')}`;
}

/**
 * Cria o pedido com preços do banco. Condicional reserva o estoque na hora (RN-08);
 * compra só confere a disponibilidade e baixa na confirmação (RN-07).
 */
export async function criarPedido(p: {
  tipo: TipoPedido;
  origem: OrigemPedido;
  clienteId: string;
  vendedorId: string;
  nomeCliente: string;
  telefoneCliente: string;
  cep?: string | null;
  linhas: LinhaPedido[];
  /** Regra de frete da compra (Q-01): grátis a partir de `gratisAcima`. Sem ela, frete 0. */
  regraFrete?: { valor: number; gratisAcima: number } | null;
}) {
  const linhas = normalizarLinhas(p.linhas);
  const resultado = await db.$transaction(async tx => {
    const variantes = await tx.variante.findMany({
      where: { id: { in: linhas.map(l => l.varianteId) } },
      include: {
        produto: {
          select: { id: true, referencia: true, nome: true, cor: true, preco: true, ativo: true, marca: { select: { nome: true } }, categoria: { select: { nome: true } }, imagens: { select: { url: true }, orderBy: { ordem: 'asc' }, take: 1 } },
        },
      },
    });
    const porId = new Map(variantes.map(v => [v.id, v]));
    const faltas: string[] = [];
    for (const l of linhas) {
      const v = porId.get(l.varianteId);
      if (!v || !v.produto.ativo) faltas.push('Uma peça da sacola não está mais disponível no catálogo.');
      else if (v.estoque - v.reservado < l.quantidade)
        faltas.push(`${v.produto.nome} (tam. ${v.tamanho}): ${Math.max(0, v.estoque - v.reservado)} disponível(is).`);
    }
    if (faltas.length) throw new ErroPedido(`Algumas peças não estão disponíveis na quantidade pedida:\n${faltas.join('\n')}`);

    if (p.tipo === 'condicional') {
      for (const l of linhas) {
        await reservar(tx, l.varianteId, l.quantidade);
      }
    }

    const itens = linhas.map(l => {
      const v = porId.get(l.varianteId)!;
      return {
        varianteId: v.id,
        produtoId: v.produto.id,
        referencia: v.produto.referencia,
        nome: v.produto.nome,
        marca: v.produto.marca.nome,
        cor: v.produto.cor,
        categoria: v.produto.categoria.nome,
        imagem: v.produto.imagens[0]?.url ?? null,
        tamanho: v.tamanho,
        codigoInterno: v.codigoInterno,
        quantidade: l.quantidade,
        precoUnitario: v.produto.preco,
      };
    });
    const total = itens.reduce((a, i) => a.add(i.precoUnitario.mul(i.quantidade)), new Prisma.Decimal(0));
    const frete = p.tipo === 'compra' && p.regraFrete && total.lt(p.regraFrete.gratisAcima) ? new Prisma.Decimal(p.regraFrete.valor) : new Prisma.Decimal(0);
    const codigo = await proximoCodigo(tx, p.tipo);
    const pedido = await tx.pedido.create({
      data: {
        codigo, tipo: p.tipo, origem: p.origem, clienteId: p.clienteId, vendedorId: p.vendedorId,
        nomeCliente: p.nomeCliente, telefoneCliente: p.telefoneCliente, cep: p.cep ?? null, total, frete,
        itens: { create: itens },
      },
    });
    return { pedido, itens };
  });
  invalidarCatalogo();
  const itensMensagem: ItemMensagem[] = resultado.itens.map(i => ({
    nome: i.nome, marca: i.marca, referencia: i.referencia, tamanho: i.tamanho, cor: i.cor, codigoInterno: i.codigoInterno,
    quantidade: i.quantidade, preco: Number(i.precoUnitario), imagem: i.imagem,
  }));
  return { id: resultado.pedido.id, codigo: resultado.pedido.codigo, total: Number(resultado.pedido.total), frete: Number(resultado.pedido.frete), itens: itensMensagem };
}

/**
 * C-07: muda o status só se ainda estiver pendente, como primeira escrita da transação. A linha do pedido fica travada
 * até o commit, então um segundo clique (ou outra pessoa) espera e depois encontra o pedido já fechado.
 */
async function fecharSePendente(tx: Tx, pedidoId: string, data: Prisma.PedidoUpdateManyMutationInput) {
  const { count } = await tx.pedido.updateMany({ where: { id: pedidoId, status: 'pendente' }, data });
  if (count === 1) return;
  const existe = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { id: true } });
  throw new ErroPedido(existe ? 'Este pedido já foi fechado.' : 'Pedido não encontrado.');
}

/**
 * Confirma o pedido. Compra: todas as peças vendidas. Condicional: `ficaram[itemId]` = quantas unidades a cliente
 * ficou (0 = voltou tudo). B-13: se ficou só parte de uma linha, ela é dividida em uma linha vendida e outra devolvida.
 * Baixa estoque, libera reservas, grava o custo do momento (RN-10) e cria a venda.
 */
export async function confirmarPedido(pedidoId: string, ficaram: Record<number, number>, usuarioId: string) {
  await db.$transaction(async tx => {
    await fecharSePendente(tx, pedidoId, { status: 'confirmado', confirmadoEm: new Date() });
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: true } });
    const cond = pedido.tipo === 'condicional';

    const custos = new Map(
      (await tx.custo.findMany({ where: { produtoId: { in: pedido.itens.map(i => i.produtoId) } } })).map(c => [c.produtoId, c.valor]),
    );
    let valor = new Prisma.Decimal(0);
    let custo = new Prisma.Decimal(0);
    let temCusto = false;

    for (const item of pedido.itens) {
      const k = cond ? ficaram[item.id] : item.quantidade;
      if (!Number.isInteger(k) || k < 0 || k > item.quantidade) throw new ErroPedido('Marque quantas unidades de cada peça ficaram.');
      const devolvidas = item.quantidade - k;
      if (k > 0 && devolvidas > 0) {
        // Parte ficou, parte voltou: a linha atual vira a vendida e uma nova linha guarda as devolvidas.
        const { id: _id, ...copia } = item;
        void _id;
        await tx.pedidoItem.create({ data: { ...copia, quantidade: devolvidas, situacao: 'devolvido', custoUnitario: null } });
        await liberarReserva(tx, item.varianteId, devolvidas);
      }
      const q = k > 0 ? k : item.quantidade;
      if (k > 0) {
        await baixarVenda(tx, { varianteId: item.varianteId, q, reservada: cond, pedidoId, usuarioId, observacao: pedido.codigo, nomePeca: `${item.nome} (tam. ${item.tamanho})` });
        const c = custos.get(item.produtoId) ?? null;
        valor = valor.add(item.precoUnitario.mul(q));
        if (c) { custo = custo.add(c.mul(q)); temCusto = true; }
        await tx.pedidoItem.update({ where: { id: item.id }, data: { situacao: 'vendido', custoUnitario: c, quantidade: q } });
      } else {
        await liberarReserva(tx, item.varianteId, q);
        await tx.pedidoItem.update({ where: { id: item.id }, data: { situacao: 'devolvido' } });
      }
    }

    if (valor.gt(0))
      await tx.venda.create({
        data: {
          pedidoId, vendedorId: pedido.vendedorId, clienteId: pedido.clienteId, valor, custo: temCusto ? custo : null,
          data: new Date(), observacao: `${cond ? 'Condicional' : 'Pedido'} ${pedido.codigo}`,
        },
      });
  });
  invalidarCatalogo();
}

/** RN-09: cancelar libera reservas do condicional. */
export async function cancelarPedido(pedidoId: string) {
  await db.$transaction(async tx => {
    await fecharSePendente(tx, pedidoId, { status: 'cancelado', canceladoEm: new Date() });
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: true } });
    if (pedido.tipo === 'condicional')
      for (const i of pedido.itens)
        await liberarReserva(tx, i.varianteId, i.quantidade);
  });
  invalidarCatalogo();
}
