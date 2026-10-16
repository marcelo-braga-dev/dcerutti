/**
 * Caixa da loja física (docs/22-caixa.md, D-23) — lógica pura, usada pela tela do caixa e pelo servidor, que confere
 * tudo de novo antes de gravar. Valores em reais; as contas são feitas em centavos para não acumular arredondamento.
 */

import { nomeDaLoja } from './loja';

export type FormaPagamento = 'pix' | 'debito' | 'credito' | 'dinheiro';

export const FORMAS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'debito', rotulo: 'Débito' },
  { valor: 'credito', rotulo: 'Crédito' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
];

export const rotuloForma = (f: string) => FORMAS.find(x => x.valor === f)?.rotulo ?? f;

const c = (r: number) => Math.round(r * 100);
const r = (cent: number) => cent / 100;

/** Linha da venda: preço de tabela (catálogo) e, se o vendedor deu desconto na peça, o preço combinado por unidade. */
export type LinhaCaixa = { varianteId: number; preco: number; quantidade: number; precoCombinado?: number | null };
/** Desconto no total da venda, em % ou em R$, antes do cupom. */
export type DescontoGeral = { tipo: 'percentual' | 'valor'; valor: number } | null;

export type CalculoVenda = {
  /** Soma a preço de tabela. */
  subtotal: number;
  /** Desconto do vendedor (peças + geral), sem o cupom. */
  desconto: number;
  /** Fração do subtotal dada de desconto pelo vendedor (0 a 1). */
  descontoParte: number;
  /** Preço final de cada unidade, por variante (o que vai para o pedido). */
  precos: Map<number, number>;
  /** Total antes do cupom. */
  total: number;
};

/**
 * Preço final de cada peça. O desconto geral vira um percentual aplicado ao preço combinado de cada unidade (arredondado
 * ao centavo), e o total é a soma desses preços: o que a tela mostra é exatamente o que o pedido grava.
 */
export function calcularVenda(linhas: LinhaCaixa[], geral: DescontoGeral = null): CalculoVenda {
  const combinado = (l: LinhaCaixa) => {
    const p = l.precoCombinado != null && l.precoCombinado >= 0 && l.precoCombinado < l.preco ? l.precoCombinado : l.preco;
    return c(p);
  };
  const subtotal = linhas.reduce((a, l) => a + c(l.preco) * l.quantidade, 0);
  const base = linhas.reduce((a, l) => a + combinado(l) * l.quantidade, 0);
  let fator = 1;
  if (geral && geral.valor > 0 && base > 0) {
    fator = geral.tipo === 'percentual' ? 1 - Math.min(100, geral.valor) / 100 : Math.max(0, 1 - Math.min(c(geral.valor), base) / base);
  }
  const precos = new Map<number, number>();
  let total = 0;
  for (const l of linhas) {
    const unit = Math.max(0, Math.round(combinado(l) * fator));
    precos.set(l.varianteId, r(unit));
    total += unit * l.quantidade;
  }
  const desconto = subtotal - total;
  return { subtotal: r(subtotal), desconto: r(desconto), descontoParte: subtotal ? desconto / subtotal : 0, precos, total: r(total) };
}

/** O vendedor dá até `limite`% sem o gestor; o gestor não tem limite. */
export const dentroDoLimite = (parte: number, limitePct: number, gestor: boolean) => gestor || parte <= limitePct / 100 + 1e-9;

export type Pagamento = { forma: FormaPagamento; valor: number; parcelas?: number | null; recebido?: number | null };

/**
 * Confere os pagamentos contra o total: quanto foi pago, quanto falta e o troco (só do dinheiro recebido a mais).
 * `ok` quando a soma dos valores bate com o total, ao centavo.
 */
export function conferirPagamentos(pagamentos: Pagamento[], total: number) {
  const pago = pagamentos.reduce((a, p) => a + c(p.valor), 0);
  const troco = pagamentos.reduce((a, p) => a + (p.forma === 'dinheiro' && p.recebido != null ? Math.max(0, c(p.recebido) - c(p.valor)) : 0), 0);
  const falta = c(total) - pago;
  const invalido = pagamentos.some(p => !(p.valor > 0) || (p.forma === 'dinheiro' && p.recebido != null && c(p.recebido) < c(p.valor)));
  return { pago: r(pago), falta: r(Math.max(0, falta)), sobra: r(Math.max(0, -falta)), troco: r(troco), ok: falta === 0 && pagamentos.length > 0 && !invalido };
}

/** "Crédito 3x", "Dinheiro (troco R$ 5,00)". */
export function descreverPagamento(p: Pagamento, brl: (n: number) => string) {
  const nome = rotuloForma(p.forma);
  if (p.forma === 'credito' && p.parcelas && p.parcelas > 1) return `${nome} ${p.parcelas}x`;
  if (p.forma === 'dinheiro' && p.recebido != null && p.recebido > p.valor) return `${nome} (recebido ${brl(p.recebido)}, troco ${brl(p.recebido - p.valor)})`;
  return nome;
}

/** Comprovante da venda para o WhatsApp da cliente (sem impressora na loja, D-23). */
export function mensagemComprovante(v: {
  codigo: string; nomeCliente?: string | null; nomeVendedor: string; quando: string;
  itens: { nome: string; tamanho: string; quantidade: number; preco: number }[];
  subtotal: number; desconto: number; cupom?: { codigo: string; desconto: number } | null; total: number;
  pagamentos: Pagamento[]; troco: number;
}, brl: (n: number) => string) {
  const primeiro = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0];
  const linhas = v.itens.map(i => `• ${i.quantidade}× ${i.nome.replace(/[*_~`]/g, '')} · Tam. ${i.tamanho} — ${brl(i.preco * i.quantidade)}`);
  const resumo = [
    `Peças: ${brl(v.subtotal)}`,
    ...(v.desconto > 0 ? [`Desconto: −${brl(v.desconto)}`] : []),
    ...(v.cupom && v.cupom.desconto > 0 ? [`Cupom ${v.cupom.codigo}: −${brl(v.cupom.desconto)}`] : []),
    `*Total: ${brl(v.total)}*`,
    ...v.pagamentos.map(p => `${descreverPagamento(p, brl)}: ${brl(p.valor)}`),
    ...(v.troco > 0 ? [`Troco: ${brl(v.troco)}`] : []),
  ];
  return [
    `${v.nomeCliente && primeiro(v.nomeCliente) ? `Olá, ${primeiro(v.nomeCliente)}! ` : 'Olá! '}Obrigada pela compra na ${nomeDaLoja()} 💛`,
    '',
    `🧾 *Comprovante ${v.codigo}*`,
    v.quando,
    '',
    ...linhas,
    '',
    ...resumo,
    '',
    `Atendimento: ${primeiro(v.nomeVendedor)}`,
    'Guarde esta mensagem. Qualquer dúvida, é só responder aqui.',
  ].join('\n');
}

// ---------- Busca e filtros do caixa (no navegador) ----------

export type VarianteCaixa = { id: number; tamanho: string; disponivel: number; codigoInterno: string | null; ean: string | null };
export type ProdutoCaixa = {
  id: number; referencia: string; nome: string; marca: string; marcaSlug: string; categoria: string; categoriaSlug: string;
  genero: string; corNome: string | null; preco: number; precoCheio: number; imperdivel: boolean; imagem: string | null;
  variantes: VarianteCaixa[]; vendidos: number;
  /** Chave do modelo (`chaveDoModelo`): as cores da mesma peça têm a mesma. */
  modelo?: string;
};

export type FiltrosCaixa = {
  q: string; genero: string | null; categoria: string | null; tamanho: string | null; cor: string | null;
  preco: 'ate-50' | '50-100' | '100-200' | 'acima-200' | null; promo: boolean; disponivel: boolean;
};
export const FILTROS_CAIXA: FiltrosCaixa = { q: '', genero: null, categoria: null, tamanho: null, cor: null, preco: null, promo: false, disponivel: true };

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const FAMILIAS = ['off white', 'jeans', 'preto', 'preta', 'branco', 'branca', 'azul', 'cinza', 'verde', 'bege', 'marrom', 'vermelho', 'rosa', 'amarelo', 'laranja', 'creme', 'caqui', 'khaki', 'vinho', 'marsala', 'roxo', 'lilas', 'multicolorido', 'estampado', 'xadrez', 'terracota', 'natural'];
const NOME_FAMILIA: Record<string, string> = { preta: 'Preto', branca: 'Branco', khaki: 'Caqui', marsala: 'Vinho', estampado: 'Estampado', lilas: 'Lilás', 'off white': 'Off White' };

/** Família da cor para o filtro: "Azul Marinho" → "Azul", "Jeans Claro" → "Jeans". */
export function familiaDaCor(cor: string | null | undefined): string | null {
  if (!cor) return null;
  const n = sem(cor);
  const f = FAMILIAS.find(x => n.startsWith(x) || n.includes(` ${x}`) || n === x);
  if (!f) return cor.trim().split(/\s+/)[0].replace(/^\p{L}/u, l => l.toUpperCase());
  return NOME_FAMILIA[f] ?? f.replace(/^\p{L}/u, l => l.toUpperCase());
}

const FAIXAS: Record<NonNullable<FiltrosCaixa['preco']>, [number, number]> = { 'ate-50': [0, 50], '50-100': [50, 100], '100-200': [100, 200], 'acima-200': [200, Infinity] };
const tamanhoNorm = (t: string) => { const u = t.trim().toUpperCase(); return u === 'UN' || u === 'U' ? 'UNI' : u; };
const temEstoque = (p: ProdutoCaixa) => p.variantes.some(v => v.disponivel > 0);

/** Peça e tamanho pelo código da etiqueta: código interno ou EAN exatos. */
export function porCodigo(lista: ProdutoCaixa[], codigo: string): { produto: ProdutoCaixa; variante: VarianteCaixa } | null {
  const c = codigo.trim();
  if (!/^\d{3,14}$/.test(c)) return null;
  for (const p of lista) for (const v of p.variantes) if (v.codigoInterno === c || v.ean === c) return { produto: p, variante: v };
  return null;
}

type Contagem = { valor: string; rotulo: string; n: number };

const ORDEM_TAMANHOS = 'XP PP P M G XG GG XXG EXG XGG G1 G2 G3 UNI'.split(' ');
/** Posição do tamanho na grade (letras, depois números, depois o resto). */
export const posicaoDoTamanho = (t: string) => { const u = tamanhoNorm(t); return ORDEM_TAMANHOS.includes(u) ? ORDEM_TAMANHOS.indexOf(u) : /^\d+$/.test(u) ? 100 + Number(u) : 999; };

export type ModeloCaixa = { chave: string; nome: string; cores: ProdutoCaixa[] };

/**
 * Junta as cores do mesmo modelo num grupo (um card no caixa, uma linha por cor), mantendo a ordem da lista:
 * o modelo entra na posição da sua primeira cor e as cores seguem a ordem em que apareceram.
 */
export function agruparModelos(lista: ProdutoCaixa[]): ModeloCaixa[] {
  const grupos = new Map<string, ModeloCaixa>();
  for (const p of lista) {
    const chave = p.modelo ?? `ref|${p.referencia}`;
    const g = grupos.get(chave) ?? { chave, nome: p.nome.replace(/\s+-\s+[^-]+$/, '').trim() || p.nome, cores: [] };
    g.cores.push(p);
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

export type TamanhoDaLinha = { tamanho: string; opcoes: { p: ProdutoCaixa; v: VarianteCaixa }[] };
export type LinhaDeCor = { chave: string; cor: string | null; p: ProdutoCaixa; tamanhos: TamanhoDaLinha[] };

/**
 * Linhas do card: uma por cor. Referências diferentes com a mesma cor e o mesmo preço (o catálogo tem algumas, como
 * duas "Cinza") viram uma linha só, e o mesmo tamanho nelas vira um botão só, com o estoque somado: para quem está
 * no balcão é a mesma peça. Tamanhos na ordem da grade.
 */
export function linhasDeCor(m: ModeloCaixa): LinhaDeCor[] {
  const linhas = new Map<string, LinhaDeCor>();
  for (const p of m.cores) {
    const chave = `${sem(p.corNome ?? '')}|${p.preco}`;
    const l = linhas.get(chave) ?? { chave, cor: p.corNome, p, tamanhos: [] };
    for (const v of p.variantes) {
      const t = l.tamanhos.find(x => tamanhoNorm(x.tamanho) === tamanhoNorm(v.tamanho));
      if (t) t.opcoes.push({ p, v });
      else l.tamanhos.push({ tamanho: v.tamanho, opcoes: [{ p, v }] });
    }
    linhas.set(chave, l);
  }
  for (const l of linhas.values()) l.tamanhos.sort((a, b) => posicaoDoTamanho(a.tamanho) - posicaoDoTamanho(b.tamanho));
  return [...linhas.values()];
}

export function filtrarCaixa(lista: ProdutoCaixa[], f: FiltrosCaixa) {
  const termos = sem(f.q).split(/\s+/).filter(Boolean);
  const digitos = /^\d{3,}$/.test(f.q.trim()) ? f.q.trim() : null;
  const casa = (p: ProdutoCaixa) => {
    if (!termos.length) return true;
    if (digitos && p.variantes.some(v => v.codigoInterno?.startsWith(digitos) || v.ean?.includes(digitos))) return true;
    const alvo = sem(`${p.nome} ${p.referencia} ${p.categoria} ${p.corNome ?? ''} ${p.marca}`);
    return termos.every(t => alvo.includes(t));
  };
  const regras = {
    genero: (p: ProdutoCaixa) => !f.genero || p.genero === f.genero,
    categoria: (p: ProdutoCaixa) => !f.categoria || p.categoriaSlug === f.categoria,
    tamanho: (p: ProdutoCaixa) => !f.tamanho || p.variantes.some(v => tamanhoNorm(v.tamanho) === f.tamanho && (v.disponivel > 0 || !f.disponivel)),
    cor: (p: ProdutoCaixa) => !f.cor || familiaDaCor(p.corNome) === f.cor,
    preco: (p: ProdutoCaixa) => !f.preco || (p.preco >= FAIXAS[f.preco][0] && p.preco < FAIXAS[f.preco][1]),
    promo: (p: ProdutoCaixa) => !f.promo || p.imperdivel || p.preco < p.precoCheio,
    disponivel: (p: ProdutoCaixa) => !f.disponivel || temEstoque(p),
  };
  type K = keyof typeof regras;
  const base = lista.filter(casa);
  const semRegra = (fora?: K) => base.filter(p => (Object.keys(regras) as K[]).every(k => k === fora || regras[k](p)));
  const contar = (itens: ProdutoCaixa[], chave: (p: ProdutoCaixa) => string | string[] | null, rotulo: (k: string, p: ProdutoCaixa) => string): Contagem[] => {
    const m = new Map<string, Contagem>();
    for (const p of itens) for (const k of [chave(p) ?? []].flat()) {
      const c = m.get(k) ?? { valor: k, rotulo: rotulo(k, p), n: 0 };
      c.n++;
      m.set(k, c);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };

  const lista_ = semRegra();
  const produtos = [...lista_].sort((a, b) => {
    if (termos.length) {
      const ia = sem(a.nome).startsWith(termos[0]) ? 0 : 1, ib = sem(b.nome).startsWith(termos[0]) ? 0 : 1;
      if (ia !== ib) return ia - ib;
    }
    return Number(temEstoque(b)) - Number(temEstoque(a)) || Number(!!b.imagem) - Number(!!a.imagem) || b.vendidos - a.vendidos || b.id - a.id;
  });
  return {
    produtos,
    contagens: {
      generos: contar(semRegra('genero'), p => p.genero, k => ({ feminino: 'Feminino', masculino: 'Masculino', unissex: 'Unissex' })[k] ?? k),
      categorias: contar(semRegra('categoria'), p => p.categoriaSlug, (_, p) => p.categoria),
      tamanhos: contar(semRegra('tamanho'), p => [...new Set(p.variantes.filter(v => v.disponivel > 0 || !f.disponivel).map(v => tamanhoNorm(v.tamanho)))], k => k)
        .sort((a, b) => posicaoDoTamanho(a.valor) - posicaoDoTamanho(b.valor)),
      cores: contar(semRegra('cor'), p => familiaDaCor(p.corNome), k => k),
      precos: (Object.keys(FAIXAS) as NonNullable<FiltrosCaixa['preco']>[]).map(k => ({
        valor: k, rotulo: { 'ate-50': 'Até R$ 50', '50-100': 'R$ 50–100', '100-200': 'R$ 100–200', 'acima-200': 'Acima de R$ 200' }[k],
        n: semRegra('preco').filter(p => p.preco >= FAIXAS[k][0] && p.preco < FAIXAS[k][1]).length,
      })).filter(c => c.n > 0 || c.valor === f.preco),
      promo: semRegra('promo').filter(p => p.imperdivel || p.preco < p.precoCheio).length,
    },
  };
}
