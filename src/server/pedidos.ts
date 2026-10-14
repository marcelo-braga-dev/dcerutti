import 'server-only';
import { Prisma, type TipoPedido, type OrigemPedido } from '@prisma/client';
import { db } from './db';
import { invalidarCatalogo } from './catalogo';
import { ErroNegocio } from './erros';
import { baixarVenda, liberarReserva, reservar } from './estoque';
import { descreverMudancas, garantirRegistroInicial, registrarHistorico } from './historico';
import { cupomNoPedido } from './cupons';
import { gerarCupomProximaCompra, type CupomGerado } from './campanhas';
import { plural, textoCancelamento } from '@/lib/pedido';
import { brl } from '@/lib/dinheiro';
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
  /** Quem fez o pedido (cliente ou equipe), para o histórico. */
  usuarioId?: string | null;
  /** Cupom informado (docs/20-cupons.md). Recusado, o pedido não é gravado e o motivo sobe como ErroPedido. */
  cupom?: { codigo: string; quem: 'cliente' | 'equipe' } | null;
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
        precoTabela: v.produto.preco,
      };
    });
    const total = itens.reduce((a, i) => a.add(i.precoUnitario.mul(i.quantidade)), new Prisma.Decimal(0));
    // null = a combinar (sem regra de frete, condicional, seleção do vendedor); 0 = grátis.
    const frete = p.tipo !== 'compra' || !p.regraFrete ? null : p.regraFrete.gratisAcima > 0 && total.gte(p.regraFrete.gratisAcima) ? new Prisma.Decimal(0) : new Prisma.Decimal(p.regraFrete.valor);
    const codigo = await proximoCodigo(tx, p.tipo);
    const pedido = await tx.pedido.create({
      data: {
        codigo, tipo: p.tipo, origem: p.origem, clienteId: p.clienteId, vendedorId: p.vendedorId,
        nomeCliente: p.nomeCliente, telefoneCliente: p.telefoneCliente, cep: p.cep ?? null, total, frete,
        itens: { create: itens },
      },
    });
    const fraseCupom = p.cupom
      ? await cupomNoPedido(tx, pedido.id, { codigo: p.cupom.codigo, quem: p.cupom.quem, regraFrete: p.regraFrete ?? null }).catch(e => {
          throw e instanceof ErroNegocio ? new ErroPedido(e.message) : e;
        })
      : null;
    await registrarHistorico(tx, { pedidoId: pedido.id, acao: 'criado', usuarioId: p.usuarioId ?? null, mudancas: fraseCupom ? [fraseCupom] : [] });
    const final = fraseCupom ? await tx.pedido.findUniqueOrThrow({ where: { id: pedido.id } }) : pedido;
    return { pedido: final, itens };
  });
  invalidarCatalogo();
  const itensMensagem: ItemMensagem[] = resultado.itens.map(i => ({
    nome: i.nome, marca: i.marca, referencia: i.referencia, tamanho: i.tamanho, cor: i.cor, codigoInterno: i.codigoInterno,
    quantidade: i.quantidade, preco: Number(i.precoUnitario), imagem: i.imagem,
  }));
  const ped = resultado.pedido;
  return {
    id: ped.id, codigo: ped.codigo, total: Number(ped.total), frete: ped.frete == null ? null : Number(ped.frete), itens: itensMensagem,
    cupom: ped.codigoCupom ? { codigo: ped.codigoCupom, desconto: Number(ped.descontoCupom), freteGratis: ped.freteCupom } : null,
  };
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
export async function confirmarPedido(pedidoId: string, ficaram: Record<number, number>, usuarioId: string): Promise<{ cupomGerado: CupomGerado | null }> {
  const resultado = await db.$transaction(async tx => {
    await fecharSePendente(tx, pedidoId, { status: 'confirmado', confirmadoEm: new Date() });
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: true } });
    const cond = pedido.tipo === 'condicional';
    await garantirRegistroInicial(tx, pedidoId, pedido.criadoEm);
    let vendidas = 0;
    let voltaram = 0;

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
      vendidas += k;
      voltaram += item.quantidade - k;
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

    // Cupom: no condicional vale só sobre o que ficou (pode sair, se o que ficou não chega ao mínimo); a venda é já com o desconto.
    const fraseCupom = pedido.cupomId && cond ? await cupomNoPedido(tx, pedidoId, { quem: 'equipe', regraFrete: null, somenteVendidos: true }) : null;
    if (pedido.cupomId) {
      const d = await tx.pedidoItem.aggregate({ where: { pedidoId, situacao: 'vendido' }, _sum: { descontoCupom: true } });
      valor = valor.sub(d._sum.descontoCupom ?? 0);
    }

    if (valor.gt(0))
      await tx.venda.create({
        data: {
          pedidoId, vendedorId: pedido.vendedorId, clienteId: pedido.clienteId, valor, custo: temCusto ? custo : null,
          data: new Date(), observacao: `${pedido.origem === 'balcao' ? 'Venda na loja' : cond ? 'Condicional' : 'Pedido'} ${pedido.codigo}`,
        },
      });
    const mudancas = cond
      ? [`Ficou com a cliente: ${plural(vendidas, 'peça', 'peças')} (${brl(Number(valor))})`, ...(voltaram ? [`Voltou: ${plural(voltaram, 'peça', 'peças')}`] : [])]
      : [`Venda de ${brl(Number(valor))}`];
    if (fraseCupom) mudancas.push(fraseCupom);
    // Campanha de próxima compra (fase 4): a venda pode gerar um cupom pessoal para a cliente.
    const tinhaCupom = !!(await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { cupomId: true } })).cupomId;
    const cupomGerado = valor.gt(0) ? await gerarCupomProximaCompra(tx, { pedidoId, clienteId: pedido.clienteId, valorVenda: Number(valor), tinhaCupom }) : null;
    if (cupomGerado) mudancas.push(`Cupom de próxima compra gerado: ${cupomGerado.codigo} (${cupomGerado.regra})`);
    await registrarHistorico(tx, { pedidoId, acao: 'confirmado', usuarioId, mudancas });
    return { cupomGerado };
  });
  invalidarCatalogo();
  return resultado;
}

/** Uma linha do pedido depois da edição. `itemId` = linha que já existia (pode trocar de peça); sem ele, peça nova. */
export type LinhaEdicao = { itemId?: number; varianteId: number; quantidade: number; preco: number };

const PRECO_MAXIMO = 99_999;

/**
 * U-08: a equipe ajusta um pedido ainda pendente antes de confirmar: troca tamanho, cor ou modelo de uma peça, inclui,
 * retira, muda a quantidade e o preço (desconto). `linhas` é o pedido inteiro como deve ficar; o que não vier é retirado.
 * Condicional: reserva a mais ou devolve a diferença de cada tamanho. Compra: confere a disponibilidade do que aumentou.
 * Peça que fica igual mantém o preço combinado; peça nova ou trocada usa o preço informado (o do catálogo, se não mudou).
 * O frete é recalculado pela regra atual (null continua a combinar). Cada edição entra no histórico do pedido.
 */
export async function editarPedido(
  pedidoId: string,
  linhas: LinhaEdicao[],
  regraFrete: { valor: number; gratisAcima: number } | null,
  autor: { usuarioId: string; observacao?: string | null },
) {
  await db.$transaction(async tx => {
    // Trava a linha do pedido até o commit (C-07): quem confirmar ou cancelar ao mesmo tempo espera.
    const [trava] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM pedido WHERE id = ${pedidoId} FOR UPDATE`;
    if (!trava) throw new ErroPedido('Pedido não encontrado.');
    if (trava.status !== 'pendente') throw new ErroPedido('Este pedido já foi fechado e não pode mais ser alterado.');
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: { orderBy: { id: 'asc' } } } });
    const cond = pedido.tipo === 'condicional';

    if (!linhas.length) throw new ErroPedido('O pedido precisa de pelo menos uma peça. Para desistir de tudo, cancele o pedido.');
    if (linhas.length > 40) throw new ErroPedido('Pedido com peças demais. Divida em mais de um pedido.');
    const atuais = new Map(pedido.itens.map(i => [i.id, i]));
    const usados = new Set<number>();
    for (const l of linhas) {
      if (!Number.isInteger(l.varianteId)) throw new ErroPedido('Peça inválida.');
      if (!Number.isInteger(l.quantidade) || l.quantidade < 1 || l.quantidade > 20) throw new ErroPedido('Quantidade inválida.');
      if (!Number.isFinite(l.preco) || l.preco < 0 || l.preco > PRECO_MAXIMO) throw new ErroPedido('Preço inválido.');
      if (l.itemId != null && (!atuais.has(l.itemId) || usados.has(l.itemId))) throw new ErroPedido('O pedido mudou enquanto você editava. Recarregue a página.');
      if (l.itemId != null) usados.add(l.itemId);
    }
    if (new Set(linhas.map(l => l.varianteId)).size !== linhas.length) throw new ErroPedido('A mesma peça e tamanho aparecem duas vezes. Junte numa linha só.');

    const variantes = await tx.variante.findMany({
      where: { id: { in: linhas.map(l => l.varianteId) } },
      include: {
        produto: {
          select: { id: true, referencia: true, nome: true, cor: true, preco: true, ativo: true, marca: { select: { nome: true } }, categoria: { select: { nome: true } }, imagens: { select: { url: true }, orderBy: { ordem: 'asc' }, take: 1 } },
        },
      },
    });
    const porVariante = new Map(variantes.map(v => [v.id, v]));

    // Linhas como vão ficar, com a cópia da peça (nome, cor, foto...) quando ela é nova ou foi trocada.
    const novas = linhas.map(l => {
      const v = porVariante.get(l.varianteId);
      const antes = l.itemId != null ? atuais.get(l.itemId)! : undefined;
      const mesmaPeca = antes?.varianteId === l.varianteId;
      if (!v || (!mesmaPeca && !v.produto.ativo)) throw new ErroPedido('Uma das peças escolhidas não está mais no catálogo.');
      const preco = new Prisma.Decimal(l.preco.toFixed(2));
      const dados = mesmaPeca
        ? { quantidade: l.quantidade, precoUnitario: preco }
        : {
            varianteId: v.id, produtoId: v.produto.id, referencia: v.produto.referencia, nome: v.produto.nome, marca: v.produto.marca.nome,
            cor: v.produto.cor, categoria: v.produto.categoria.nome, imagem: v.produto.imagens[0]?.url ?? null, tamanho: v.tamanho,
            codigoInterno: v.codigoInterno, quantidade: l.quantidade, precoUnitario: preco, precoTabela: v.produto.preco,
          };
      const comparavel = {
        antesId: antes?.id, varianteId: v.id, referencia: v.produto.referencia, quantidade: l.quantidade, precoUnitario: preco,
        nome: mesmaPeca ? antes!.nome : v.produto.nome, cor: mesmaPeca ? antes!.cor : v.produto.cor, tamanho: v.tamanho,
      };
      return { linha: l, antes, dados, comparavel, nomePeca: `${v.produto.nome} (tam. ${v.tamanho})`, variante: v };
    });

    // Estoque: compara o total de cada tamanho antes e depois.
    const qAntes = new Map<number, number>();
    for (const i of pedido.itens) qAntes.set(i.varianteId, (qAntes.get(i.varianteId) ?? 0) + i.quantidade);
    const qDepois = new Map(novas.map(x => [x.variante.id, x.linha.quantidade]));
    for (const id of new Set([...qAntes.keys(), ...qDepois.keys()])) {
      const dif = (qDepois.get(id) ?? 0) - (qAntes.get(id) ?? 0);
      if (!dif) continue;
      const x = novas.find(n => n.variante.id === id);
      if (dif > 0) {
        if (cond) await reservar(tx, id, dif).catch(() => { throw new ErroPedido(`${x!.nomePeca}: não há ${dif} a mais disponível.`); });
        else if (x!.variante.estoque - x!.variante.reservado < qDepois.get(id)!)
          throw new ErroPedido(`${x!.nomePeca}: só ${Math.max(0, x!.variante.estoque - x!.variante.reservado)} disponível(is).`);
      } else if (cond) await liberarReserva(tx, id, -dif);
    }

    const total = novas.reduce((a, x) => a.add(x.comparavel.precoUnitario.mul(x.linha.quantidade)), new Prisma.Decimal(0));
    const frete = pedido.frete == null || !regraFrete ? pedido.frete : regraFrete.gratisAcima > 0 && total.gte(regraFrete.gratisAcima) ? new Prisma.Decimal(0) : new Prisma.Decimal(regraFrete.valor);
    const mudancas = descreverMudancas(pedido.itens, novas.map(x => x.comparavel), {
      totalAntes: Number(pedido.total), totalDepois: Number(total), freteAntes: pedido.frete == null ? null : Number(pedido.frete), freteDepois: frete == null ? null : Number(frete),
    });
    if (!mudancas.length) throw new ErroPedido('Nada foi alterado.');

    await garantirRegistroInicial(tx, pedidoId, pedido.criadoEm);
    // Primeiro apaga as retiradas, para uma peça poder sair de uma linha e entrar em outra.
    await tx.pedidoItem.deleteMany({ where: { pedidoId, id: { notIn: [...usados] } } });
    for (const x of novas)
      if (x.antes) await tx.pedidoItem.update({ where: { id: x.antes.id }, data: x.dados });
      else await tx.pedidoItem.create({ data: { ...(x.dados as Prisma.PedidoItemUncheckedCreateInput), pedidoId } });
    await tx.pedido.update({ where: { id: pedidoId }, data: { total, frete } });
    // O cupom acompanha a edição: recalculado sobre as peças novas, ou retirado (com o motivo) se deixou de valer.
    const fraseCupom = await cupomNoPedido(tx, pedidoId, { quem: 'equipe', regraFrete });
    if (fraseCupom) mudancas.push(fraseCupom);
    await registrarHistorico(tx, { pedidoId, acao: 'editado', usuarioId: autor.usuarioId, mudancas, observacao: autor.observacao });
  });
  invalidarCatalogo();
}

/**
 * Fase 3 dos cupons: a equipe aplica, troca (`codigo`) ou retira (`codigo` null) o cupom de um pedido pendente.
 * Aplicar confere todas as regras, como na sacola; recusado, nada muda e o motivo sobe. Entra no histórico.
 */
export async function trocarCupomDoPedido(pedidoId: string, codigo: string | null, regraFrete: { valor: number; gratisAcima: number } | null, autor: { usuarioId: string; observacao?: string | null }) {
  await db.$transaction(async tx => {
    const [trava] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM pedido WHERE id = ${pedidoId} FOR UPDATE`;
    if (!trava) throw new ErroPedido('Pedido não encontrado.');
    if (trava.status !== 'pendente') throw new ErroPedido('Este pedido já foi fechado e não pode mais ser alterado.');
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { criadoEm: true, codigoCupom: true } });
    if (!codigo && !pedido.codigoCupom) throw new ErroPedido('Este pedido não tem cupom.');
    await garantirRegistroInicial(tx, pedidoId, pedido.criadoEm);
    const frase = await cupomNoPedido(tx, pedidoId, codigo ? { codigo, quem: 'equipe', regraFrete } : { quem: 'equipe', regraFrete, retirar: true }).catch(e => {
      throw e instanceof ErroNegocio && !(e instanceof ErroPedido) ? new ErroPedido(e.message) : e;
    });
    const mudancas = [pedido.codigoCupom && codigo ? `Cupom ${pedido.codigoCupom} trocado` : null, frase].filter((x): x is string => !!x);
    await registrarHistorico(tx, { pedidoId, acao: 'editado', usuarioId: autor.usuarioId, mudancas, observacao: autor.observacao });
  });
}

/** RN-09: cancelar libera reservas do condicional. */
export type MotivoCancelamento = 'equipe' | 'cliente' | 'expirado';

/** `usuarioId` = quem cancelou e `observacao` = por quê, para o histórico (null = sistema, na expiração). */
export async function cancelarPedido(pedidoId: string, motivo: MotivoCancelamento, usuarioId: string | null = null, observacao: string | null = null) {
  await db.$transaction(async tx => {
    await fecharSePendente(tx, pedidoId, { status: 'cancelado', canceladoEm: new Date(), motivoCancelamento: motivo });
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: true } });
    if (pedido.tipo === 'condicional')
      for (const i of pedido.itens)
        await liberarReserva(tx, i.varianteId, i.quantidade);
    await garantirRegistroInicial(tx, pedidoId, pedido.criadoEm);
    await registrarHistorico(tx, { pedidoId, acao: 'cancelado', usuarioId, mudancas: [textoCancelamento(motivo, false) ?? 'Cancelado'], observacao });
  });
  invalidarCatalogo();
}
