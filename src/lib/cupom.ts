/**
 * Regras do cupom (docs/20-cupons.md), sem banco: a sacola (prévia), o servidor (gravação) e o painel usam esta mesma
 * conta. Dinheiro em centavos inteiros por dentro, para a soma das partes bater com o total.
 */
import { brl } from './dinheiro';
import { formatarData } from './datas';

export type TipoCupom = 'percentual' | 'valor' | 'freteGratis';
export type QuemAplica = 'cliente' | 'equipe' | 'ambos';

export type RegraCupom = {
  codigo: string;
  tipo: TipoCupom;
  /** % (percentual) ou R$ (valor); null no frete grátis. */
  valor: number | null;
  tetoDesconto: number | null;
  minimoCompra: number | null;
  inicioEm: Date;
  fimEm: Date | null;
  limiteTotal: number | null;
  limitePorCliente: number | null;
  somentePrimeiraCompra: boolean;
  valePromocao: boolean;
  quemAplica: QuemAplica;
  ativo: boolean;
  /** Abrangência: vazio nas três = loja toda. A peça vale se estiver em qualquer uma. */
  categorias: number[];
  marcas: number[];
  produtos: number[];
  /** Vazio = qualquer cliente. */
  clientes: string[];
};

export type PecaCupom<K = number | string> = {
  chave: K;
  produtoId: number;
  categoriaId: number;
  marcaId: number;
  /** Produto em promoção (preço menor que o cheio) ou "Imperdível". */
  emPromocao: boolean;
  /** Preço combinado da unidade (já com o desconto do vendedor). */
  preco: number;
  quantidade: number;
};

export type ContextoCupom = {
  agora: Date;
  quem: 'cliente' | 'equipe';
  clienteId: string;
  /** Pedidos não cancelados que já usam o cupom (sem contar o pedido em edição). */
  usosTotal: number;
  usosCliente: number;
  /** A cliente (ou outra ficha com o mesmo telefone) já tem venda confirmada. */
  jaComprou: boolean;
  tipoPedido: 'compra' | 'condicional' | 'balcao';
};

export type Recusa =
  | 'desativado' | 'quem' | 'agendado' | 'expirado' | 'cliente' | 'primeiraCompra' | 'esgotado' | 'jaUsou'
  | 'semFrete' | 'minimo' | 'semPecas';

export type ResultadoCupom<K = number | string> =
  | { ok: true; desconto: number; descontos: { chave: K; valor: number }[]; freteGratis: boolean }
  | { ok: false; recusa: Recusa; mensagem: string };

const centavos = (n: number) => Math.round(n * 100);
const reais = (c: number) => c / 100;

/** Código como fica gravado: maiúsculas, sem espaços. */
export const normalizarCodigo = (t: string) => String(t ?? '').trim().toUpperCase().replace(/\s+/g, '');
export const codigoValido = (t: string) => /^[A-Z0-9][A-Z0-9-]{2,29}$/.test(t);

const temAbrangencia = (c: Pick<RegraCupom, 'categorias' | 'marcas' | 'produtos'>) => c.categorias.length + c.marcas.length + c.produtos.length > 0;

/** A peça entra no desconto? (abrangência e promoção) */
export function pecaElegivel(c: RegraCupom, p: Pick<PecaCupom, 'produtoId' | 'categoriaId' | 'marcaId' | 'emPromocao'>) {
  if (p.emPromocao && !c.valePromocao) return false;
  if (!temAbrangencia(c)) return true;
  return c.produtos.includes(p.produtoId) || c.categorias.includes(p.categoriaId) || c.marcas.includes(p.marcaId);
}

/**
 * Divide `total` (centavos) entre as linhas na proporção do valor de cada uma. A sobra do arredondamento vai para a
 * linha de maior valor, então a soma das partes é sempre exatamente o total.
 */
function distribuir<K>(linhas: { chave: K; valor: number }[], total: number): { chave: K; valor: number }[] {
  const base = linhas.reduce((a, l) => a + l.valor, 0);
  if (!base || !total) return linhas.map(l => ({ chave: l.chave, valor: 0 }));
  const partes = linhas.map(l => ({ chave: l.chave, valor: Math.floor((total * l.valor) / base), peso: l.valor }));
  const sobra = total - partes.reduce((a, p) => a + p.valor, 0);
  const maior = partes.reduce((m, p, i) => (p.peso > partes[m].peso ? i : m), 0);
  partes[maior].valor += sobra;
  return partes.map(p => ({ chave: p.chave, valor: p.valor }));
}

/** Confere o cupom para o pedido e calcula o desconto de cada linha (em reais), ou devolve o motivo da recusa. */
export function avaliarCupom<K>(c: RegraCupom, pecas: PecaCupom<K>[], ctx: ContextoCupom): ResultadoCupom<K> {
  const nao = (recusa: Recusa, mensagem: string): ResultadoCupom<K> => ({ ok: false, recusa, mensagem });
  if (!c.ativo) return nao('desativado', 'Este cupom não está mais disponível.');
  if (c.quemAplica !== 'ambos' && c.quemAplica !== ctx.quem)
    return nao('quem', ctx.quem === 'cliente' ? 'Este cupom só pode ser aplicado pelo seu vendedor.' : 'Este cupom é só para a cliente usar na sacola.');
  if (ctx.agora < c.inicioEm) return nao('agendado', `Este cupom começa em ${formatarData(c.inicioEm)}.`);
  if (c.fimEm && ctx.agora > c.fimEm) return nao('expirado', `Este cupom expirou em ${formatarData(c.fimEm)}.`);
  if (c.clientes.length && !c.clientes.includes(ctx.clienteId)) return nao('cliente', 'Este cupom não está disponível para esta cliente.');
  if (c.somentePrimeiraCompra && ctx.jaComprou) return nao('primeiraCompra', 'Este cupom é só para a primeira compra.');
  if (c.limiteTotal != null && ctx.usosTotal >= c.limiteTotal) return nao('esgotado', 'Este cupom esgotou.');
  if (c.limitePorCliente != null && ctx.usosCliente >= c.limitePorCliente)
    return nao('jaUsou', c.limitePorCliente === 1 ? 'Este cupom já foi usado por esta cliente.' : `Este cupom já foi usado ${c.limitePorCliente} vezes por esta cliente.`);
  if (c.tipo === 'freteGratis' && ctx.tipoPedido !== 'compra') return nao('semFrete', 'Este cupom vale só para pedido com entrega.');

  // P-08: o mínimo é sobre o pedido todo (peças com o desconto do vendedor, sem frete).
  const subtotal = pecas.reduce((a, p) => a + centavos(p.preco) * p.quantidade, 0);
  if (c.minimoCompra != null && subtotal < centavos(c.minimoCompra))
    return nao('minimo', `Faltam ${brl(reais(centavos(c.minimoCompra) - subtotal))} para usar este cupom (mínimo de ${brl(c.minimoCompra)}).`);

  const elegiveis = pecas.filter(p => pecaElegivel(c, p)).map(p => ({ chave: p.chave, valor: centavos(p.preco) * p.quantidade }));
  if (!elegiveis.some(e => e.valor > 0)) return nao('semPecas', 'Este cupom não vale para as peças deste pedido.');

  if (c.tipo === 'freteGratis') return { ok: true, desconto: 0, descontos: pecas.map(p => ({ chave: p.chave, valor: 0 })), freteGratis: true };

  const base = elegiveis.reduce((a, e) => a + e.valor, 0);
  let desconto = c.tipo === 'percentual' ? Math.round((base * (c.valor ?? 0)) / 100) : centavos(c.valor ?? 0);
  if (c.tipo === 'percentual' && c.tetoDesconto != null) desconto = Math.min(desconto, centavos(c.tetoDesconto));
  desconto = Math.max(0, Math.min(desconto, base));

  const porChave = new Map(distribuir(elegiveis, desconto).map(d => [d.chave, d.valor]));
  return {
    ok: true,
    desconto: reais(desconto),
    descontos: pecas.map(p => ({ chave: p.chave, valor: reais(porChave.get(p.chave) ?? 0) })),
    freteGratis: false,
  };
}

export type SituacaoCupom = 'ativo' | 'agendado' | 'expirado' | 'esgotado' | 'desativado';

export function situacaoCupom(c: Pick<RegraCupom, 'ativo' | 'inicioEm' | 'fimEm' | 'limiteTotal'>, usos: number, agora = new Date()): SituacaoCupom {
  if (!c.ativo) return 'desativado';
  if (c.fimEm && agora > c.fimEm) return 'expirado';
  if (c.limiteTotal != null && usos >= c.limiteTotal) return 'esgotado';
  if (agora < c.inicioEm) return 'agendado';
  return 'ativo';
}

export const ROTULO_SITUACAO: Record<SituacaoCupom, string> = { ativo: 'Ativo', agendado: 'Agendado', expirado: 'Expirado', esgotado: 'Esgotado', desativado: 'Desativado' };

const pct = (n: number) => `${String(n).replace('.', ',')}%`;

/** "10% de desconto" / "R$ 20,00 de desconto" / "Frete grátis". */
export function beneficio(c: Pick<RegraCupom, 'tipo' | 'valor' | 'tetoDesconto'>) {
  if (c.tipo === 'freteGratis') return 'Frete grátis';
  if (c.tipo === 'valor') return `${brl(c.valor ?? 0)} de desconto`;
  return `${pct(c.valor ?? 0)} de desconto${c.tetoDesconto != null ? ` (até ${brl(c.tetoDesconto)})` : ''}`;
}

/** Regra do cupom em palavras, para o vendedor divulgar e para a cliente entender. `nomes` = nomes das categorias, marcas e produtos. */
export function regraEmPalavras(
  c: Pick<RegraCupom, 'tipo' | 'valor' | 'tetoDesconto' | 'minimoCompra' | 'valePromocao' | 'somentePrimeiraCompra' | 'fimEm' | 'limitePorCliente'>,
  nomes: string[] = [],
) {
  const partes = [beneficio(c)];
  if (nomes.length) partes.push(`em ${nomes.join(', ')}`);
  if (c.minimoCompra != null) partes.push(`em compras a partir de ${brl(c.minimoCompra)}`);
  if (!c.valePromocao) partes.push('não vale para produtos em promoção');
  if (c.somentePrimeiraCompra) partes.push('só na primeira compra');
  if (c.limitePorCliente != null) partes.push(c.limitePorCliente === 1 ? 'uma vez por cliente' : `até ${c.limitePorCliente} vezes por cliente`);
  if (c.fimEm) partes.push(`até ${formatarData(c.fimEm)}`);
  return partes.join(' · ');
}

export const QUEM_APLICA: Record<QuemAplica, string> = { cliente: 'Cliente, na sacola', equipe: 'Vendedor, no pedido', ambos: 'Cliente e vendedor' };
export const TIPOS: Record<TipoCupom, string> = { percentual: 'Percentual (%)', valor: 'Valor fixo (R$)', freteGratis: 'Frete grátis' };
