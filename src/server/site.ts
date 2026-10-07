import 'server-only';
import { headers } from 'next/headers';
import { CABECALHO_CAMINHO } from '@/lib/url';

/** Endereço público do site (para links de convite). */
/** Caminho pedido, com a busca (vem do proxy). Usado para mandar ao login com `volta` (B-04). */
export async function caminhoAtual() {
  return (await headers()).get(CABECALHO_CAMINHO) ?? '/';
}

export async function urlDoSite() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}
