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
