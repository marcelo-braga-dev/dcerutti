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
  /** Vídeos (D-29), com a capa (foto) quando houver. */
  videos: VideoCatalogo[];
  variantes: VarianteCatalogo[];
  /** Cores do mesmo modelo (lib/cores.ts): a vitrine mostra um card por modelo, com as bolinhas de cor. */
  modelo?: string;
  /** Nome da cor desta peça ("Off White"). */
  corNome?: string | null;
  /** Todas as cores do modelo, esta inclusive, na ordem do catálogo. */
  cores?: CorModelo[];
};

export type VideoCatalogo = { url: string; capa: string | null };

export type CorModelo = { referencia: string; cor: string | null; imagem: string | null; disponivel: boolean };

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

export type Ordem = 'relevancia' | 'novidades' | 'menor-preco' | 'maior-preco' | 'desconto';
export type FiltroEstoque = 'todos' | 'disponiveis' | 'esgotados';

export const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'relevancia', rotulo: 'Relevância' },
  { valor: 'novidades', rotulo: 'Novidades' },
  { valor: 'menor-preco', rotulo: 'Menor preço' },
  { valor: 'maior-preco', rotulo: 'Maior preço' },
  { valor: 'desconto', rotulo: 'Maior desconto' },
];

/** Faixas de preço do filtro (R$). */
export const FAIXAS_PRECO = [
  { valor: 'ate-50', rotulo: 'Até R$ 50', min: 0, max: 50 },
  { valor: '50-100', rotulo: 'R$ 50 a 100', min: 50, max: 100 },
  { valor: '100-200', rotulo: 'R$ 100 a 200', min: 100, max: 200 },
  { valor: 'acima-200', rotulo: 'Acima de R$ 200', min: 200, max: Infinity },
] as const;
export type FaixaPreco = (typeof FAIXAS_PRECO)[number]['valor'];
const naFaixa = (preco: number, faixa: FaixaPreco) => {
  const f = FAIXAS_PRECO.find(x => x.valor === faixa)!;
  return preco >= f.min && preco < f.max;
};

/** "UN", "U" e "UNICO" são o mesmo tamanho único: aparecem e filtram como "UNI". */
export const normalizarTamanho = (t: string) => {
  const u = t.trim().toUpperCase();
  return u === 'UN' || u === 'U' || u === 'UNICO' || u === 'ÚNICO' ? 'UNI' : u;
};
/** Letras (PP, M, GG, UNI) ou numeração (34–52, infantil). */
export const grupoTamanho = (t: string): 'letras' | 'numeracao' => (/^\d+$/.test(normalizarTamanho(t)) ? 'numeracao' : 'letras');

/** Grupos de categoria do filtro, pelo nome (sem acento). Categoria nova cai em "Outros" até entrar aqui. */
export const GRUPOS_CATEGORIA: { rotulo: string; nomes: string[] }[] = [
  { rotulo: 'Parte de cima', nomes: ['camisetas', 'camisas', 'camisas polo', 'blusas', 'regatas', 'tops', 'bodies', 'tricos', 'sueteres', 'moletons', 'jaquetas', 'blazers', 'casacos', 'coletes', 'batas'] },
  { rotulo: 'Parte de baixo', nomes: ['calcas', 'bermudas', 'shorts', 'saias', 'leggings'] },
  { rotulo: 'Vestidos e macacões', nomes: ['vestidos', 'macacoes'] },
  { rotulo: 'Íntimas e pijamas', nomes: ['cuecas', 'sutias', 'calcinhas', 'ceroulas', 'roupas intimas', 'pijamas', 'meias'] },
  { rotulo: 'Acessórios e kits', nomes: ['acessorios', 'cintos', 'gorros', 'lencos', 'necessaires', 'malas', 'bones', 'kits'] },
];
export const grupoDaCategoria = (nome: string) => GRUPOS_CATEGORIA.find(g => g.nomes.includes(normalizar(nome)))?.rotulo ?? 'Outros';

export type Filtros = {
  marca: string | null;
  genero: Genero | null;
  categoria: string | null;
  tamanho: string | null;
  preco: FaixaPreco | null;
  promo: boolean;
  imperdivel: boolean;
  estacao: Estacao | null;
  estoque: FiltroEstoque;
  q: string;
  ordem: Ordem;
  pagina: number;
};

export const FILTROS_VAZIOS: Filtros = {
  marca: null, genero: null, categoria: null, tamanho: null, preco: null, promo: false, imperdivel: false,
  estacao: null, estoque: 'todos', q: '', ordem: 'relevancia', pagina: 1,
};

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function lerFiltros(sp: Params): Filtros {
  const genero = um(sp.genero);
  const estacao = um(sp.estacao);
  const estoque = um(sp.estoque);
  const ordem = um(sp.ordem);
  const preco = um(sp.preco);
  const pagina = parseInt(um(sp.pagina), 10);
  const tamanho = um(sp.tamanho);
  return {
    marca: um(sp.marca) || null,
    genero: GENEROS.some(g => g.valor === genero) ? (genero as Genero) : null,
    categoria: um(sp.categoria) || null,
    tamanho: tamanho ? normalizarTamanho(tamanho).slice(0, 8) : null,
    preco: FAIXAS_PRECO.some(f => f.valor === preco) ? (preco as FaixaPreco) : null,
    promo: um(sp.promo) === '1',
    imperdivel: um(sp.imperdivel) === '1',
    estacao: ESTACOES.some(e => e.valor === estacao) ? (estacao as Estacao) : null,
    estoque: estoque === 'disponiveis' || estoque === 'esgotados' ? estoque : 'todos',
    q: um(sp.q).slice(0, 80),
    ordem: ORDENS.some(o => o.valor === ordem) ? (ordem as Ordem) : 'relevancia',
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
  if (f.preco) p.set('preco', f.preco);
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
  [f.marca, f.genero, f.categoria, f.tamanho, f.preco, f.promo, f.imperdivel, f.estacao, f.estoque !== 'todos', f.q].filter(Boolean).length;

export type Contagem = { valor: string; rotulo: string; n: number };

export type ResultadoCatalogo = {
  produtos: ProdutoCatalogo[];
  total: number;
  temMais: boolean;
  /**
   * Quantas peças cada opção traria, com a busca e todos os outros filtros aplicados (menos o do próprio grupo).
   * Opção que daria zero some, exceto a escolhida.
   */
  contagens: {
    marcas: Contagem[];
    generos: Contagem[];
    categorias: (Contagem & { grupo: string })[];
    tamanhos: Contagem[];
    precos: Contagem[];
    estacoes: Contagem[];
    promo: number;
    imperdivel: number;
    disponiveis: number;
    esgotados: number;
  };
};

const desconto = (p: ProdutoCatalogo) => (p.precoCheio > p.preco ? 1 - p.preco / p.precoCheio : 0);

/** Alterna as categorias (uma de cada por vez, na ordem em que aparecem), para a vitrine não repetir a mesma peça em fila. */
export function intercalar<T>(itens: T[], chave: (x: T) => string): T[] {
  const filas = new Map<string, T[]>();
  for (const x of itens) {
    const k = chave(x);
    const fila = filas.get(k);
    if (fila) fila.push(x);
    else filas.set(k, [x]);
  }
  const listas = [...filas.values()];
  const r: T[] = [];
  for (let i = 0; r.length < itens.length; i++) for (const l of listas) if (i < l.length) r.push(l[i]);
  return r;
}

const modeloDe = (p: ProdutoCatalogo) => p.modelo ?? `ref|${p.referencia}`;
const contarModelos = (l: ProdutoCatalogo[]) => new Set(l.map(modeloDe)).size;
/** Fica a primeira cor de cada modelo, na ordem já definida (a mais relevante para os filtros e a ordenação). */
export function umPorModelo(lista: ProdutoCatalogo[]) {
  const vistos = new Set<string>();
  return lista.filter(p => { const k = modeloDe(p); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

type Faceta = 'marca' | 'genero' | 'categoria' | 'tamanho' | 'preco' | 'promo' | 'imperdivel' | 'estacao' | 'estoque';

export function filtrarCatalogo(lista: ProdutoCatalogo[], f: Filtros): ResultadoCatalogo {
  const termos = termosDeBusca(f.q);
  const temTamanho = (p: ProdutoCatalogo, t: string) => p.variantes.some(v => v.disponivel > 0 && normalizarTamanho(v.tamanho) === t);
  const regras: Record<Faceta, (p: ProdutoCatalogo) => boolean> = {
    marca: p => !f.marca || p.marcaSlug === f.marca,
    genero: p => !f.genero || p.genero === f.genero,
    categoria: p => !f.categoria || p.categoriaSlug === f.categoria,
    tamanho: p => !f.tamanho || temTamanho(p, f.tamanho),
    preco: p => !f.preco || naFaixa(p.preco, f.preco),
    promo: p => !f.promo || emPromocao(p),
    imperdivel: p => !f.imperdivel || p.imperdivel,
    estacao: p => !f.estacao || p.estacao === f.estacao,
    estoque: p => f.estoque === 'todos' || (f.estoque === 'disponiveis' ? emEstoque(p) : !emEstoque(p)),
  };
  const daBusca = termos.length ? lista.filter(p => casaBusca(p, termos)) : lista;
  /** Peças que passam em todos os filtros, menos os indicados. */
  const sem = (...fora: Faceta[]) => daBusca.filter(p => (Object.keys(regras) as Faceta[]).every(k => fora.includes(k) || regras[k](p)));

  let resultado = sem();
  if (f.ordem === 'menor-preco') resultado = [...resultado].sort((a, b) => a.preco - b.preco);
  else if (f.ordem === 'maior-preco') resultado = [...resultado].sort((a, b) => b.preco - a.preco);
  else if (f.ordem === 'desconto') resultado = [...resultado].sort((a, b) => desconto(b) - desconto(a) || a.preco - b.preco);
  else {
    // Novidades: os cadastrados por último primeiro. Relevância: o mesmo, com estoque e foto antes e as categorias
    // alternadas (sem busca ou categoria escolhida), para a primeira tela mostrar variedade.
    const novos = [...resultado].sort((a, b) => b.id - a.id);
    if (f.ordem === 'novidades') resultado = novos;
    else {
      // Peça "pronta" para a vitrine: com estoque e foto; entre elas, mais tamanhos e mais fotos vêm antes (grade cheia
      // vende mais e mostra melhor). Empate: a mais nova.
      const nota = (p: ProdutoCatalogo) => Math.min(p.variantes.filter(v => v.disponivel > 0).length, 5) * 2 + Math.min(p.imagens.length, 3);
      const prontas = novos.filter(p => emEstoque(p) && p.imagens.length > 0).sort((a, b) => nota(b) - nota(a));
      const resto = novos.filter(p => !(emEstoque(p) && p.imagens.length > 0)).sort((a, b) => Number(emEstoque(b)) - Number(emEstoque(a)));
      resultado = [...(termos.length || f.categoria ? prontas : intercalar(prontas, p => p.categoriaSlug)), ...resto];
    }
  }

  // Vitrine e contagens por modelo: as cores da mesma peça viram um card só (bolinhas de cor no card).
  resultado = umPorModelo(resultado);
  const contar = (itens: ProdutoCatalogo[], chave: (x: ProdutoCatalogo) => string | string[], rotulo: (k: string, x: ProdutoCatalogo) => string) => {
    const m = new Map<string, Contagem & { modelos: Set<string> }>();
    for (const x of itens) for (const k of [chave(x)].flat()) {
      const c = m.get(k) ?? { valor: k, rotulo: rotulo(k, x), n: 0, modelos: new Set<string>() };
      c.modelos.add(modeloDe(x));
      c.n = c.modelos.size;
      m.set(k, c);
    }
    return [...m.values()].map(c => ({ valor: c.valor, rotulo: c.rotulo, n: c.n }));
  };
  /** Garante que a opção escolhida aparece mesmo sem peças (para poder ser desmarcada). */
  const comEscolhida = (cs: Contagem[], escolhida: string | null, rotulo: (k: string) => string) =>
    escolhida && !cs.some(c => c.valor === escolhida) ? [...cs, { valor: escolhida, rotulo: rotulo(escolhida), n: 0 }] : cs;

  const semEstoque = sem('estoque');
  const disponiveis = contarModelos(semEstoque.filter(emEstoque));
  const limite = f.pagina * POR_PAGINA;
  const categorias = comEscolhida(contar(sem('categoria'), p => p.categoriaSlug, (_, p) => p.categoria), f.categoria, k => k)
    .map(c => ({ ...c, grupo: grupoDaCategoria(c.rotulo) }))
    .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo));

  return {
    produtos: resultado.slice(0, limite),
    total: resultado.length,
    temMais: resultado.length > limite,
    contagens: {
      marcas: comEscolhida(contar(sem('marca'), p => p.marcaSlug, (_, p) => p.marca), f.marca, k => k).sort((a, b) => b.n - a.n),
      generos: comEscolhida(contar(sem('genero'), p => p.genero, k => GENEROS.find(g => g.valor === k)?.rotulo ?? k), f.genero, k => k).sort((a, b) => b.n - a.n),
      categorias,
      tamanhos: comEscolhida(
        contar(sem('tamanho'), p => [...new Set(p.variantes.filter(v => v.disponivel > 0).map(v => normalizarTamanho(v.tamanho)))], k => k),
        f.tamanho, k => k,
      ).sort((a, b) => posicaoTamanho(a.valor) - posicaoTamanho(b.valor) || a.valor.localeCompare(b.valor, 'pt-BR', { numeric: true })),
      precos: FAIXAS_PRECO.map(x => ({ valor: x.valor, rotulo: x.rotulo, n: contarModelos(sem('preco').filter(p => naFaixa(p.preco, x.valor))) }))
        .filter(c => c.n > 0 || c.valor === f.preco),
      estacoes: ESTACOES.map(e => ({ valor: e.valor, rotulo: e.rotulo, n: contarModelos(sem('estacao').filter(p => p.estacao === e.valor)) }))
        .filter(c => c.n > 0 || c.valor === f.estacao),
      promo: contarModelos(sem('promo').filter(emPromocao)),
      imperdivel: contarModelos(sem('imperdivel').filter(p => p.imperdivel)),
      disponiveis,
      esgotados: contarModelos(semEstoque.filter(p => !emEstoque(p))),
    },
  };
}
