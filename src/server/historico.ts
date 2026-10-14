import 'server-only';
import type { AcaoPedido, Prisma } from '@prisma/client';
import { brl } from '@/lib/dinheiro';

/**
 * Histórico do pedido: o que a cliente pediu (criado), cada edição da equipe, a confirmação e o cancelamento.
 * Cada registro guarda as peças como ficaram depois da ação, para comparar o pedido original com o final.
 * Sempre dentro da transação que fez a mudança.
 */
type Tx = Prisma.TransactionClient;

export type PecaHistorico = { referencia: string; nome: string; cor: string | null; tamanho: string; quantidade: number; preco: number; precoTabela: number | null };

type ItemComparavel = { id?: number; varianteId: number; referencia: string; nome: string; cor: string | null; tamanho: string; quantidade: number; precoUnitario: { toString(): string } };

const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

export const descricaoPeca = (i: Pick<ItemComparavel, 'nome' | 'cor' | 'tamanho'>) => `${i.nome}${i.cor ? ` · ${i.cor}` : ''} · tam. ${i.tamanho}`;

/** Frases do que mudou entre as peças de antes e as de depois (comparadas pelo id da linha do pedido). */
export function descreverMudancas(
  antes: ItemComparavel[],
  depois: (ItemComparavel & { antesId?: number })[],
  totais: { totalAntes: number; totalDepois: number; freteAntes: number | null; freteDepois: number | null },
): string[] {
  const r: string[] = [];
  const porId = new Map(antes.map(i => [i.id, i]));
  const mantidos = new Set(depois.map(d => d.antesId).filter(Boolean));
  for (const a of antes) if (!mantidos.has(a.id)) r.push(`Retirou ${descricaoPeca(a)} (${a.quantidade} un.)`);
  for (const d of depois) {
    const a = d.antesId ? porId.get(d.antesId) : undefined;
    if (!a) {
      r.push(`Incluiu ${descricaoPeca(d)} (${d.quantidade} un. a ${brl(n(d.precoUnitario))})`);
      continue;
    }
    if (a.varianteId !== d.varianteId) r.push(`Trocou ${descricaoPeca(a)} por ${descricaoPeca(d)}`);
    if (a.quantidade !== d.quantidade) r.push(`${descricaoPeca(d)}: quantidade de ${a.quantidade} para ${d.quantidade}`);
    const pa = n(a.precoUnitario)!, pd = n(d.precoUnitario)!;
    if (pa !== pd) r.push(`${descricaoPeca(d)}: preço de ${brl(pa)} para ${brl(pd)}`);
  }
  if (totais.totalAntes !== totais.totalDepois) r.push(`Total das peças de ${brl(totais.totalAntes)} para ${brl(totais.totalDepois)}`);
  if (totais.freteAntes !== totais.freteDepois)
    r.push(`Frete de ${totais.freteAntes == null ? 'a combinar' : brl(totais.freteAntes)} para ${totais.freteDepois == null ? 'a combinar' : brl(totais.freteDepois)}`);
  return r;
}

/** Grava um registro com as peças atuais do pedido. `usuarioId` null = sistema (ex.: expiração). */
export async function registrarHistorico(
  tx: Tx,
  p: { pedidoId: string; acao: AcaoPedido; usuarioId: string | null; mudancas?: string[]; observacao?: string | null; criadoEm?: Date },
) {
  const [pedido, usuario] = await Promise.all([
    tx.pedido.findUniqueOrThrow({ where: { id: p.pedidoId }, select: { total: true, frete: true, itens: { orderBy: { id: 'asc' } } } }),
    p.usuarioId ? tx.user.findUnique({ where: { id: p.usuarioId }, select: { name: true, papel: true } }) : null,
  ]);
  const autor = !usuario ? 'sistema' : usuario.papel === 'cliente' ? 'cliente' : 'equipe';
  const itens: PecaHistorico[] = pedido.itens.map(i => ({
    referencia: i.referencia, nome: i.nome, cor: i.cor, tamanho: i.tamanho, quantidade: i.quantidade, preco: n(i.precoUnitario)!, precoTabela: n(i.precoTabela),
  }));
  await tx.pedidoHistorico.create({
    data: {
      pedidoId: p.pedidoId, acao: p.acao, autor, usuarioId: usuario ? p.usuarioId : null, nomeUsuario: autor === 'equipe' ? usuario!.name : null,
      mudancas: p.mudancas ?? [], itens, total: pedido.total, frete: pedido.frete, observacao: p.observacao?.trim() || null,
      ...(p.criadoEm ? { criadoEm: p.criadoEm } : {}),
    },
  });
}

/**
 * Pedido criado antes do histórico existir: na primeira mudança, registra como ele estava, com a data de criação.
 * Edições feitas antes do histórico (só quantidade) não aparecem.
 */
export async function garantirRegistroInicial(tx: Tx, pedidoId: string, criadoEm: Date) {
  if (await tx.pedidoHistorico.count({ where: { pedidoId } })) return;
  await registrarHistorico(tx, {
    pedidoId, acao: 'criado', usuarioId: null, criadoEm,
    mudancas: ['Pedido anterior ao histórico: estas são as peças como estavam antes da primeira alteração registrada.'],
  });
}
