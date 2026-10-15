/** Histórico do cliente (docs/21) — lógica pura, usada no servidor e testada em tests/unit. */
import { GENEROS, ESTACOES, lerFiltros, type Filtros } from './catalogo';

export type Aparelho = 'celular' | 'tablet' | 'computador';

/** Aparelho pelo User-Agent. Sem User-Agent, computador. */
export function aparelhoDe(ua: string | null | undefined): Aparelho {
  const s = ua ?? '';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(s)) return 'celular';
  return 'computador';
}

/** Uma visita termina depois de 30 minutos sem nenhuma página aberta. */
export const MINUTOS_VISITA = 30;
/** Histórico guardado por 12 meses (D-18). */
export const MESES_RETENCAO = 12;

/** Caminho da loja que vale registrar: interno, sem painel, API ou arquivos. */
export function caminhoValido(c: unknown): c is string {
  return typeof c === 'string' && c.length <= 300 && c.startsWith('/') && !c.startsWith('//') && !/^\/(painel|api|arquivos|_next)(\/|$|\?)/.test(c);
}

/** Filtros do catálogo que a cliente escolheu (sem ordem e página), no formato guardado em `dados.filtros`. */
export type FiltrosAtivos = Partial<Record<'marca' | 'genero' | 'categoria' | 'tamanho' | 'estacao' | 'estoque', string>> & { promo?: true; imperdivel?: true };

export function filtrosAtivos(f: Filtros): FiltrosAtivos {
  const r: FiltrosAtivos = {};
  if (f.marca) r.marca = f.marca;
  if (f.genero) r.genero = f.genero;
  if (f.categoria) r.categoria = f.categoria;
  if (f.tamanho) r.tamanho = f.tamanho;
  if (f.estacao) r.estacao = f.estacao;
  if (f.estoque !== 'todos') r.estoque = f.estoque;
  if (f.promo) r.promo = true;
  if (f.imperdivel) r.imperdivel = true;
  return r;
}

export type Classificacao =
  | { tipo: 'produto'; referencia: string }
  | { tipo: 'busca'; termo: string; filtros: FiltrosAtivos; filtrosCatalogo: Filtros }
  | { tipo: 'filtro'; filtros: FiltrosAtivos }
  | { tipo: 'pagina' };

/** Que tipo de página é: peça, busca no catálogo, catálogo filtrado ou outra página. */
export function classificarCaminho(caminho: string): Classificacao {
  const url = new URL(caminho, 'http://loja');
  const produto = url.pathname.match(/^\/produto\/([^/]+)\/?$/);
  if (produto) {
    try { return { tipo: 'produto', referencia: decodeURIComponent(produto[1]).slice(0, 20) }; } catch { return { tipo: 'pagina' }; }
  }
  if (url.pathname === '/catalogo') {
    const f = lerFiltros(Object.fromEntries(url.searchParams));
    const filtros = filtrosAtivos(f);
    if (f.q.trim()) return { tipo: 'busca', termo: f.q.trim().slice(0, 100), filtros, filtrosCatalogo: f };
    if (Object.keys(filtros).length) return { tipo: 'filtro', filtros };
  }
  return { tipo: 'pagina' };
}

const ROTULO_ESTOQUE: Record<string, string> = { disponiveis: 'só disponíveis', esgotados: 'só esgotados' };

/** "Feminino · Blusas · Tam. M · Em promoção". `nomes` traduz slugs de categoria e marca, quando conhecidos. */
export function descreverFiltros(f: FiltrosAtivos | null | undefined, nomes: { categorias?: Map<string, string>; marcas?: Map<string, string> } = {}) {
  if (!f) return '';
  return [
    f.genero && (GENEROS.find(g => g.valor === f.genero)?.rotulo ?? f.genero),
    f.categoria && (nomes.categorias?.get(f.categoria) ?? f.categoria),
    f.marca && (nomes.marcas?.get(f.marca) ?? f.marca),
    f.tamanho && `Tam. ${f.tamanho}`,
    f.estacao && (ESTACOES.find(e => e.valor === f.estacao)?.rotulo ?? f.estacao),
    f.promo && 'Em promoção',
    f.imperdivel && 'Imperdível',
    f.estoque && (ROTULO_ESTOQUE[f.estoque] ?? f.estoque),
  ].filter(Boolean).join(' · ');
}

/** Agrupa eventos (mais novos primeiro) em visitas: um intervalo maior que MINUTOS_VISITA começa outra. */
export function agruparVisitas<T extends { criadoEm: Date }>(eventos: T[], minutos = MINUTOS_VISITA): { inicio: Date; fim: Date; eventos: T[] }[] {
  const visitas: { inicio: Date; fim: Date; eventos: T[] }[] = [];
  for (const e of eventos) {
    const atual = visitas.at(-1);
    if (atual && atual.inicio.getTime() - e.criadoEm.getTime() <= minutos * 60_000) {
      atual.eventos.push(e);
      atual.inicio = e.criadoEm;
    } else visitas.push({ inicio: e.criadoEm, fim: e.criadoEm, eventos: [e] });
  }
  return visitas;
}

/** Ranking de valores com a parte de cada um no total (0 a 1). */
export function ranking<T>(itens: T[], chave: (x: T) => string | null | undefined, peso: (x: T) => number = () => 1) {
  const soma = new Map<string, number>();
  for (const x of itens) {
    const k = chave(x);
    if (k) soma.set(k, (soma.get(k) ?? 0) + peso(x));
  }
  const total = [...soma.values()].reduce((a, n) => a + n, 0);
  return [...soma.entries()].map(([valor, n]) => ({ valor, n, parte: total ? n / total : 0 })).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor));
}

/** "45 s", "3 min", "1 h 20 min". */
export function duracaoEmPalavras(seg: number | null | undefined) {
  const s = Math.max(0, Math.round(seg ?? 0));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function tempoDesde(d: Date | string | null | undefined, agora = new Date()) {
  if (!d) return 'nunca';
  const min = Math.floor((agora.getTime() - new Date(d).getTime()) / 60_000);
  if (min < 2) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

/** Linha da sacola guardada no servidor. */
export type ItemSacolaGuardada = { varianteId: number; quantidade: number };

export function lerItensSacola(json: unknown): ItemSacolaGuardada[] {
  if (!Array.isArray(json)) return [];
  return json.filter((i): i is ItemSacolaGuardada => !!i && Number.isInteger(i.varianteId) && Number.isInteger(i.quantidade) && i.quantidade > 0);
}
