'use server';

import { revalidatePath } from 'next/cache';
import { EQUIPE, exigirPapel } from '../permissoes';
import { marcarLidas, resumoNotificacoes, salvarPreferencias } from '../notificacoes';
import { ehTipoNotificacao, type TipoNotificacao } from '@/lib/notificacoes';

/** Sino da barra superior (D-28): não lidas e as últimas, consultado a cada minuto. */
export async function resumoNotificacoesAcao() {
  const u = await exigirPapel(EQUIPE);
  return resumoNotificacoes(u.id);
}

/** Marca uma (ou todas, sem `id`) como lida. */
export async function marcarLidaAcao(id?: string) {
  const u = await exigirPapel(EQUIPE);
  if (id && !/^\d{1,20}$/.test(id)) return { ok: false };
  await marcarLidas(u.id, id);
  revalidatePath('/painel/notificacoes');
  return { ok: true };
}

/** Preferências: os tipos desligados no painel e a escolha de e-mail contrária ao padrão. */
export async function salvarPreferenciasAcao(prefs: { painel: string[]; email: string[] }) {
  const u = await exigirPapel(EQUIPE);
  const limpar = (l: unknown) => (Array.isArray(l) ? l.filter(ehTipoNotificacao) : []) as TipoNotificacao[];
  await salvarPreferencias(u.id, { painel: limpar(prefs?.painel), email: limpar(prefs?.email) });
  revalidatePath('/painel/notificacoes');
  return { ok: true };
}
