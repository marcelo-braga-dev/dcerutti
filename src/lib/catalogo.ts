/** Tipos e filtros do catálogo — lógica pura, usada no servidor e testada em tests/. */

export type Genero = 'feminino' | 'masculino' | 'unissex';
export type Estacao = 'inverno' | 'verao';

export type VarianteCatalogo = { id: number; tamanho: string; disponivel: number; codigoInterno: string | null };

export type ProdutoCatalogo = {
  id: number;
  referencia: string;
  nome: string;
  marca: string;
  marcaSlug: string;
  categoria: string;
  categoriaSlug: string;
  subcategoria: string | null;
  genero: Genero;
  estacao: Estacao | null;
  cor: string | null;
  composicao: string | null;
  descricao: string | null;
  destaques: string[];
  preco: number;
  precoCheio: number;
  imperdivel: boolean;
  imagens: string[];
  variantes: VarianteCatalogo[];
};

export const ORDEM_TAMANHOS = ['XP', 'PP', 'P', 'M', 'G', 'XG', 'GG', 'XXG', 'EXG', 'XGG', 'G1', 'G2', 'G3', 'UNI', 'U',
  '1', '2', '4', '6', '8', '10', '12', '14', '16', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54'];

export const posicaoTamanho = (t: string) => {
  const i = ORDEM_TAMANHOS.indexOf(t.toUpperCase());
  return i < 0 ? 999 : i;
};

export const GENEROS: { valor: Genero; rotulo: string }[] = [
  { valor: 'feminino', rotulo: 'Feminino' },
  { valor: 'masculino', rotulo: 'Masculino' },
  { valor: 'unissex', rotulo: 'Unissex' },
];

export const ESTACOES: { valor: Estacao; rotulo: string }[] = [
  { valor: 'inverno', rotulo: 'Inverno' },
  { valor: 'verao', rotulo: 'Verão' },
];

export const emEstoque = (p: ProdutoCatalogo) => p.variantes.some(v => v.disponivel > 0);

/** Promoção comum (o "Imperdível" tem destaque próprio). */
export const emPromocao = (p: ProdutoCatalogo) => !p.imperdivel && p.precoCheio > 0 && p.preco < p.precoCheio;

export const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Busca sem acento: todos os termos precisam aparecer em nome, referência, categoria ou cor. */
export const termosDeBusca = (q: string) => normalizar(q).split(/\s+/).filter(Boolean);
export const casaBusca = (p: Pick<ProdutoCatalogo, 'nome' | 'referencia' | 'categoria' | 'cor'>, termos: string[]) => {
  if (!termos.length) return true;
  const alvo = normalizar(`${p.nome} ${p.referencia} ${p.categoria} ${p.cor ?? ''}`);
  return termos.every(t => alvo.includes(t));
};

export const POR_PAGINA = 24;

export type Ordem = 'relevancia' | 'menor-preco' | 'maior-preco';
export type FiltroEstoque = 'todos' | 'disponiveis' | 'esgotados';

export type Filtros = {
  marca: string | null;
  genero: Genero | null;
  categoria: string | null;
  tamanho: string | null;
  promo: boolean;
  imperdivel: boolean;
  estacao: Estacao | null;
  estoque: FiltroEstoque;
  q: string;
  ordem: Ordem;
  pagina: number;
};

export const FILTROS_VAZIOS: Filtros = {
  marca: null, genero: null, categoria: null, tamanho: null, promo: false, imperdivel: false,
  estacao: null, estoque: 'todos', q: '', ordem: 'relevancia', pagina: 1,
};

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function lerFiltros(sp: Params): Filtros {
  const genero = um(sp.genero);
  const estacao = um(sp.estacao);
  const estoque = um(sp.estoque);
  const ordem = um(sp.ordem);
  const pagina = parseInt(um(sp.pagina), 10);
  return {
    marca: um(sp.marca) || null,
    genero: GENEROS.some(g => g.valor === genero) ? (genero as Genero) : null,
    categoria: um(sp.categoria) || null,
    tamanho: um(sp.tamanho) || null,
    promo: um(sp.promo) === '1',
    imperdivel: um(sp.imperdivel) === '1',
    estacao: ESTACOES.some(e => e.valor === estacao) ? (estacao as Estacao) : null,
    estoque: estoque === 'disponiveis' || estoque === 'esgotados' ? estoque : 'todos',
    q: um(sp.q).slice(0, 80),
    ordem: ordem === 'menor-preco' || ordem === 'maior-preco' ? ordem : 'relevancia',
    pagina: pagina > 0 && pagina < 100 ? pagina : 1,
  };
}

/** Monta a URL do catálogo a partir dos filtros atuais com alterações. Mudar qualquer filtro volta à página 1. */
export function urlCatalogo(atual: Filtros, mudar: Partial<Filtros> = {}) {
  const f = { ...atual, pagina: 1, ...mudar };
  const p = new URLSearchParams();
  if (f.marca) p.set('marca', f.marca);
  if (f.genero) p.set('genero', f.genero);
  if (f.categoria) p.set('categoria', f.categoria);
  if (f.tamanho) p.set('tamanho', f.tamanho);
  if (f.promo) p.set('promo', '1');
  if (f.imperdivel) p.set('imperdivel', '1');
  if (f.estacao) p.set('estacao', f.estacao);
  if (f.estoque !== 'todos') p.set('estoque', f.estoque);
  if (f.q) p.set('q', f.q);
  if (f.ordem !== 'relevancia') p.set('ordem', f.ordem);
  if (f.pagina > 1) p.set('pagina', String(f.pagina));
  const s = p.toString();
  return s ? `/catalogo?${s}` : '/catalogo';
}

export const contarFiltros = (f: Filtros) =>
  [f.marca, f.genero, f.categoria, f.tamanho, f.promo, f.imperdivel, f.estacao, f.estoque !== 'todos', f.q].filter(Boolean).length;

export type Contagem = { valor: string; rotulo: string; n: number };

export type ResultadoCatalogo = {
  produtos: ProdutoCatalogo[];
  total: number;
  temMais: boolean;
  contagens: {
    marcas: Contagem[];
    generos: Contagem[];
    categorias: Contagem[];
    tamanhos: string[];
    promo: number;
    imperdivel: number;
    disponiveis: number;
    esgotados: number;
  };
};

export function filtrarCatalogo(lista: ProdutoCatalogo[], f: Filtros): ResultadoCatalogo {
  const termos = termosDeBusca(f.q);
  const buscaOk = (p: ProdutoCatalogo) => casaBusca(p, termos);

  const porMarca = lista.filter(p => !f.marca || p.marcaSlug === f.marca);
  const porGenero = porMarca.filter(p => !f.genero || p.genero === f.genero);
  const base = porGenero.filter(
    p =>
      (!f.categoria || p.categoriaSlug === f.categoria) &&
      (!f.tamanho || p.variantes.some(v => v.tamanho === f.tamanho && v.disponivel > 0)) &&
      (!f.promo || emPromocao(p)) &&
      (!f.imperdivel || p.imperdivel) &&
      (!f.estacao || p.estacao === f.estacao) &&
      buscaOk(p),
  );

  let resultado = base.filter(p => f.estoque === 'todos' || (f.estoque === 'disponiveis' ? emEstoque(p) : !emEstoque(p)));
  if (f.ordem === 'menor-preco') resultado = [...resultado].sort((a, b) => a.preco - b.preco);
  else if (f.ordem === 'maior-preco') resultado = [...resultado].sort((a, b) => b.preco - a.preco);
  else resultado = [...resultado].sort((a, b) => Number(emEstoque(b)) - Number(emEstoque(a)) || Number(b.imagens.length > 0) - Number(a.imagens.length > 0));

  const contar = <T,>(itens: T[], chave: (x: T) => string, rotulo: (x: T) => string) => {
    const m = new Map<string, Contagem>();
    for (const x of itens) {
      const k = chave(x);
      const c = m.get(k) ?? { valor: k, rotulo: rotulo(x), n: 0 };
      c.n++;
      m.set(k, c);
    }
    return [...m.values()];
  };

  const disponiveis = base.filter(emEstoque).length;
  const limite = f.pagina * POR_PAGINA;
  return {
    produtos: resultado.slice(0, limite),
    total: resultado.length,
    temMais: resultado.length > limite,
    contagens: {
      marcas: contar(lista, p => p.marcaSlug, p => p.marca).sort((a, b) => b.n - a.n),
      generos: contar(porMarca, p => p.genero, p => GENEROS.find(g => g.valor === p.genero)!.rotulo).sort((a, b) => b.n - a.n),
      categorias: contar(porGenero, p => p.categoriaSlug, p => p.categoria).sort((a, b) => b.n - a.n),
      tamanhos: [...new Set(porGenero.flatMap(p => p.variantes.filter(v => v.disponivel > 0).map(v => v.tamanho)))].sort(
        (a, b) => posicaoTamanho(a) - posicaoTamanho(b),
      ),
      promo: porGenero.filter(emPromocao).length,
      imperdivel: porGenero.filter(p => p.imperdivel).length,
      disponiveis,
      esgotados: base.length - disponiveis,
    },
  };
}
