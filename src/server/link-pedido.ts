// Sem 'server-only' de propósito: também é usado por scripts e testes fora do Next.
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Link público do pedido (D-20): /p/PED-000123.<assinatura>. A página e a imagem do cartão abrem sem login, porque
 * quem gera a prévia do link no WhatsApp é o aparelho da cliente, sem a sessão do site. A assinatura (HMAC do código
 * com o segredo do servidor, 96 bits) impede chegar a outros pedidos trocando o número. Não há nome, telefone nem CEP
 * da cliente nessas telas.
 */
const segredo = () => {
  const s = process.env.LINK_PEDIDO_SEGREDO || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error('Defina LINK_PEDIDO_SEGREDO (ou BETTER_AUTH_SECRET) para assinar os links de pedido.');
  return s;
};

const CODIGO = /^(PED|COND)-\d{6,}$/;

const assinar = (codigo: string) => createHmac('sha256', segredo()).update(`pedido:${codigo}`).digest('base64url').slice(0, 16);

/** "PED-000123.Xy3…" */
export function chaveDoPedido(codigo: string) {
  if (!CODIGO.test(codigo)) throw new Error(`Código de pedido inválido: ${codigo}`);
  return `${codigo}.${assinar(codigo)}`;
}

/** Código do pedido se a chave for autêntica; senão null. */
export function codigoDaChave(chave: string | null | undefined): string | null {
  const m = /^((?:PED|COND)-\d{6,})\.([A-Za-z0-9_-]{16})$/.exec(String(chave ?? ''));
  if (!m) return null;
  const esperado = Buffer.from(assinar(m[1]));
  const recebido = Buffer.from(m[2]);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? m[1] : null;
}

/** Endereço da página pública e da imagem do cartão. */
export const linkPublicoDoPedido = (site: string, codigo: string) => `${site.replace(/\/$/, '')}/p/${chaveDoPedido(codigo)}`;
