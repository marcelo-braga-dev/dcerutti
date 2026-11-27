/**
 * Identidade visual editável pelo gestor (D-25). As cores do site são variáveis CSS (`--color-*`, src/app/globals.css);
 * o layout raiz grava por cima só as que o gestor mudou. Os nomes das variáveis ficam como estão (marrom-950,
 * caramelo…): o código usa esses nomes, e a página de identidade mostra o papel de cada uma.
 */

export type Token =
  | 'marrom-950' | 'caramelo' | 'creme' | 'card' | 'marrom-900' | 'oliva' | 'imperdivel'
  | 'marrom-700' | 'vermelho' | 'areia' | 'bege' | 'borda' | 'borda-forte' | 'suave';

export type DefinicaoCor = { token: Token; rotulo: string; ajuda: string; padrao: string; avancada?: boolean };

/** Ordem da página. As avançadas ficam recolhidas. Os padrões espelham src/app/globals.css. */
export const CORES: DefinicaoCor[] = [
  { token: 'marrom-950', rotulo: 'Cor primária', ajuda: 'Topo do painel e do caixa, rodapé, botões principais, títulos e preços.', padrao: '#2e2520' },
  { token: 'caramelo', rotulo: 'Cor secundária', ajuda: 'Destaques, links, selos e o contorno de foco.', padrao: '#6d402a' },
  { token: 'creme', rotulo: 'Cor de fundo', ajuda: 'Fundo das páginas e o texto sobre a cor primária.', padrao: '#f6f2ec' },
  { token: 'card', rotulo: 'Fundo dos cartões', ajuda: 'Cartões, campos, listas e janelas.', padrao: '#fffdf9' },
  { token: 'marrom-900', rotulo: 'Cor do texto', ajuda: 'Texto comum das páginas.', padrao: '#3a2e27' },
  { token: 'oliva', rotulo: 'Cor de confirmação', ajuda: 'Botões de confirmar, mensagens de sucesso e o troco.', padrao: '#5e6b43' },
  { token: 'imperdivel', rotulo: 'Cor de promoção', ajuda: 'Preços em promoção e selos de desconto.', padrao: '#e3261b' },
  { token: 'suave', rotulo: 'Texto secundário', ajuda: 'Legendas, dicas e informações de apoio.', padrao: '#76685d', avancada: true },
  { token: 'vermelho', rotulo: 'Erros e alertas', ajuda: 'Mensagens de erro e avisos.', padrao: '#b8462f', avancada: true },
  { token: 'areia', rotulo: 'Detalhes sobre a primária', ajuda: 'Textos de apoio sobre a cor primária (menu do painel, rodapé).', padrao: '#ddcdb3', avancada: true },
  { token: 'bege', rotulo: 'Fundos suaves', ajuda: 'Fundo de fotos sem imagem, etiquetas e áreas de destaque leve.', padrao: '#efe4d6', avancada: true },
  { token: 'borda', rotulo: 'Bordas', ajuda: 'Linhas e contornos discretos.', padrao: '#e6dccd', avancada: true },
  { token: 'borda-forte', rotulo: 'Bordas fortes', ajuda: 'Contorno dos campos e botões de opção.', padrao: '#cfc2b2', avancada: true },
  { token: 'marrom-700', rotulo: 'Primária, variação', ajuda: 'Botão principal ao passar o mouse e detalhes em tom próximo da primária.', padrao: '#4a2b1c', avancada: true },
];

export const CORES_PADRAO = Object.fromEntries(CORES.map(c => [c.token, c.padrao])) as Record<Token, string>;

export type Imagem = { url: string; largura: number; altura: number };

export type Identidade = {
  /** Nome da loja (títulos, mensagens, e-mails) e assinatura; vazios = os de fábrica (lib/loja.ts). */
  nome?: string;
  slogan?: string;
  /** Só as cores que o gestor mudou; o resto vale o padrão. */
  cores: Partial<Record<Token, string>>;
  /** Logo para fundo claro (cabeçalho da loja, imagem do pedido). */
  logo: Imagem | null;
  /** Logo para fundo escuro (tela de entrar, painel, caixa). */
  logoClara: Imagem | null;
  /** Ícone da aba do navegador e do atalho no celular (PNG quadrado). */
  favicon: Imagem | null;
};

export const IDENTIDADE_PADRAO: Identidade = { cores: {}, logo: null, logoClara: null, favicon: null };

/** Logos de fábrica (public/). */
export const LOGO_PADRAO: Imagem = { url: '/logo-dcerutti.png', largura: 620, altura: 285 };
export const LOGO_CLARA_PADRAO: Imagem = { url: '/logo-dcerutti-claro.png', largura: 620, altura: 285 };

export const corValida = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Normaliza o que o gestor digitou: "#ABC", "abc123" → "#aabbcc"/"#abc123"; inválido → null. */
export function lerCor(v: string): string | null {
  let t = v.trim().toLowerCase();
  if (!t.startsWith('#')) t = `#${t}`;
  if (/^#[0-9a-f]{3}$/.test(t)) t = `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return corValida(t) ? t : null;
}

/** Todas as cores, com o padrão onde o gestor não mudou. */
export const coresDe = (id: Identidade): Record<Token, string> => ({ ...CORES_PADRAO, ...id.cores });

/** Só as cores diferentes do padrão (o que vale a pena gravar). */
export function soMudadas(cores: Partial<Record<Token, string>>): Partial<Record<Token, string>> {
  const r: Partial<Record<Token, string>> = {};
  for (const c of CORES) {
    const v = cores[c.token];
    if (corValida(v) && v.toLowerCase() !== c.padrao) r[c.token] = v.toLowerCase();
  }
  return r;
}

/** CSS que o layout raiz põe na página. `html:root` ganha do `:root` do Tailwind (mais específico). Vazio sem mudanças. */
export function cssDoTema(cores: Partial<Record<Token, string>>): string {
  const linhas = Object.entries(soMudadas(cores)).map(([t, v]) => `--color-${t}:${v}`);
  return linhas.length ? `html:root{${linhas.join(';')}}` : '';
}

/** Contraste WCAG entre duas cores (1 a 21). Texto comum pede 4,5; texto grande ou negrito, 3. */
export function contraste(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bb] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Pares que precisam ser legíveis, para os avisos da página. */
export const PARES_CONTRASTE: { texto: Token; fundo: Token; onde: string; minimo: number }[] = [
  { texto: 'marrom-900', fundo: 'creme', onde: 'Texto sobre o fundo', minimo: 4.5 },
  { texto: 'marrom-900', fundo: 'card', onde: 'Texto sobre os cartões', minimo: 4.5 },
  { texto: 'creme', fundo: 'marrom-950', onde: 'Texto dos botões principais', minimo: 4.5 },
  { texto: 'marrom-950', fundo: 'card', onde: 'Títulos e preços', minimo: 4.5 },
  { texto: 'suave', fundo: 'card', onde: 'Texto secundário', minimo: 4.5 },
  { texto: 'creme', fundo: 'oliva', onde: 'Botões de confirmar', minimo: 3 },
  { texto: 'imperdivel', fundo: 'card', onde: 'Preço de promoção', minimo: 3 },
  { texto: 'caramelo', fundo: 'card', onde: 'Links e destaques', minimo: 3 },
];
