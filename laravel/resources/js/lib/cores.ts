/**
 * Cores das peças (vistoria visual de 15/10/2026). No catálogo a cor vem no fim do nome ("Bermuda Chino - Bege");
 * o campo `cor` quase sempre está vazio. Daqui saem o nome da cor, o modelo (para juntar as cores da mesma peça) e um
 * tom aproximado para a bolinha de cor. Tom desconhecido: a bolinha mostra a foto.
 */
import { normalizar } from './catalogo';

const SUFIXO = /\s+-\s+([^-]+)$/;

/** Nome sem a cor: "Bermuda Básica Chino". Sem sufixo de cor, o nome inteiro. */
export const nomeDoModelo = (nome: string) => nome.replace(SUFIXO, '').trim();

/** "Off White", "Jeans Medio"… do sufixo do nome ou do campo cor; null se não houver. */
export function nomeDaCor(nome: string, cor?: string | null): string | null {
  const bruto = SUFIXO.exec(nome)?.[1]?.trim() || cor?.trim();
  if (!bruto) return null;
  return bruto.toLowerCase().replace(/(^|\s)\p{L}/gu, l => l.toUpperCase()).replace(/\s+\d+$/, '');
}

/** Chave do modelo: peças com o mesmo nome-base, marca, categoria e gênero são cores do mesmo modelo. */
export function chaveDoModelo(p: { nome: string; referencia: string; marcaSlug: string; categoriaSlug: string; genero: string }) {
  return SUFIXO.test(p.nome) ? `${p.marcaSlug}|${p.categoriaSlug}|${p.genero}|${normalizar(nomeDoModelo(p.nome))}` : `ref|${p.referencia}`;
}

/** Ordem importa: o mais específico primeiro. */
const TONS: [RegExp, string][] = [
  [/multicolor|estampad|xadrez|listrad|floral/, 'estampa'],
  [/jeans (black|preto)/, '#2b2f36'], [/jeans escuro/, '#2b3a52'], [/jeans claro/, '#8fa9c6'], [/jeans/, '#4a6b8f'],
  [/off ?white|gelo/, '#efe9dc'], [/creme|natural|cru/, '#ece0c6'],
  [/preto|preta/, '#1d1d1b'], [/branco|branca/, '#fbfbf9'],
  [/cinza mescla escuro|cinza escuro|chumbo|grafite/, '#55565a'], [/cinza claro|mescla/, '#c8c8c6'], [/cinza/, '#97979a'],
  [/azul marinho|marinho|azul escuro/, '#1f2c4c'], [/azul claro|azul bebe/, '#a8c6e4'], [/azul/, '#3f6ea8'],
  [/verde militar|verde escuro|oliva/, '#3d4a2f'], [/verde claro|menta/, '#a9c99c'], [/verde/, '#4f7d4c'],
  [/vermelho escuro|bordo/, '#7e1f1c'], [/vermelho/, '#c0312b'], [/vinho|marsala/, '#6b1f2c'],
  [/rosa claro|rose/, '#f2cdd6'], [/rosa/, '#e49bb0'], [/lilas/, '#bba6d8'], [/roxo claro/, '#a58cc8'], [/roxo/, '#5f3f86'],
  [/amarelo/, '#e7c447'], [/laranja/, '#e07a2f'], [/terracota|ferrugem/, '#b35a37'],
  [/bege escuro|caqui|khaki/, '#ad9668'], [/bege/, '#d8c4a3'], [/marrom escuro|cafe/, '#4a3226'], [/marrom|chocolate/, '#70503a'],
];

/** Tom aproximado da cor ('estampa' para estampados), ou null se não reconhecer. */
export function tomDaCor(cor: string | null | undefined): string | null {
  if (!cor) return null;
  const n = normalizar(cor);
  return TONS.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Cores claras pedem borda na bolinha, senão somem no fundo creme. */
export const corClara = (tom: string | null) => !!tom && tom.startsWith('#') && parseInt(tom.slice(1, 3), 16) + parseInt(tom.slice(3, 5), 16) + parseInt(tom.slice(5, 7), 16) > 600;
