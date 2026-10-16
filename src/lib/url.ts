/** Cabeçalho com o caminho pedido (com a busca), posto pelo proxy, para os layouts mandarem ao login com `volta` (B-04). */
export const CABECALHO_CAMINHO = 'x-dcerutti-caminho';

const BASE = 'http://interno.invalid';

/**
 * Aceita só caminhos deste site ("/painel/pedidos"). Recusa "//outro.com", "/\outro.com",
 * caracteres de controle e qualquer coisa que o navegador resolva para outra origem.
 */
export function caminhoInterno(v: string | null | undefined): string | null {
  const s = String(v ?? '');
  if (!/^\/(?![/\\])/.test(s) || /[\\\u0000-\u001f]/.test(s)) return null;
  try {
    return new URL(s, BASE).origin === BASE ? s : null;
  } catch {
    return null;
  }
}

/**
 * Endereço de uma lista com os filtros atuais trocados por `mudar` (null tira o filtro). Mudar um filtro volta para
 * a primeira página.
 */
export function comFiltros(base: string, atual: Record<string, string | null | undefined>, mudar: Record<string, string | null> = {}) {
  const p = new URLSearchParams();
  const todos = { ...atual, ...('pagina' in mudar ? {} : { pagina: null }), ...mudar };
  for (const [k, v] of Object.entries(todos)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
