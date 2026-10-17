/**
 * Notificações da equipe (D-28) — os tipos, o que cada um avisa e os padrões de entrega. Cada pessoa liga ou desliga
 * cada tipo no painel e por e-mail (Painel → Notificações → Preferências).
 */

export type TipoNotificacao =
  | 'pedido_novo' | 'pedido_cancelado' | 'carrinho_visto' | 'carrinho_respondido' | 'sacola_parada'
  | 'prazo_vencendo' | 'peca_esgotada' | 'meta_batida' | 'cliente_nova' | 'carrinho_vencendo';

export type Canal = 'painel' | 'email';

export const TIPOS_NOTIFICACAO: Record<TipoNotificacao, { rotulo: string; descricao: string; email: boolean; soGestor?: boolean }> = {
  pedido_novo: { rotulo: 'Pedido novo', descricao: 'Uma cliente enviou um pedido ou condicional (pela loja ou pelas sugestões).', email: true },
  pedido_cancelado: { rotulo: 'Pedido cancelado', descricao: 'A cliente cancelou um pedido em aberto.', email: true },
  carrinho_visto: { rotulo: 'Sugestão vista', descricao: 'A cliente abriu pela primeira vez a sugestão que você enviou.', email: false },
  carrinho_respondido: { rotulo: 'Sugestão respondida', descricao: 'A cliente marcou as peças e disse que ainda está pensando.', email: false },
  carrinho_vencendo: { rotulo: 'Sugestão vencendo', descricao: 'Uma sugestão enviada vence nas próximas 24 horas sem virar pedido.', email: false },
  sacola_parada: { rotulo: 'Sacola parada', descricao: 'A cliente deixou peças na sacola e não enviou o pedido.', email: true },
  prazo_vencendo: { rotulo: 'Prazo vencendo', descricao: 'Um pedido em aberto vence nas próximas 24 horas.', email: false },
  peca_esgotada: { rotulo: 'Peça esgotada', descricao: 'Um tamanho acabou no estoque depois de uma venda.', email: false, soGestor: true },
  meta_batida: { rotulo: 'Meta batida', descricao: 'Um vendedor alcançou a meta do mês.', email: false },
  cliente_nova: { rotulo: 'Cliente nova', descricao: 'Alguém criou a conta pela loja e ficou com você.', email: false },
};

export const ehTipoNotificacao = (v: unknown): v is TipoNotificacao => typeof v === 'string' && v in TIPOS_NOTIFICACAO;

/** Preferências guardadas: os tipos DESLIGADOS em cada canal (vazio = tudo no padrão). */
export type Preferencias = { painel: TipoNotificacao[]; email: TipoNotificacao[] };

export function lerPreferencias(v: unknown): Preferencias {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter(ehTipoNotificacao) : []);
  return { painel: lista(o.painel), email: lista(o.email) };
}

/** A pessoa quer este tipo neste canal? Painel: ligado por padrão. E-mail: o padrão do tipo. */
export function quer(prefs: Preferencias, tipo: TipoNotificacao, canal: Canal, emailPadrao = TIPOS_NOTIFICACAO[tipo].email) {
  if (canal === 'painel') return !prefs.painel.includes(tipo);
  // No e-mail a lista guarda a escolha contrária ao padrão: desligados (padrão ligado) ou ligados (padrão desligado).
  return emailPadrao ? !prefs.email.includes(tipo) : prefs.email.includes(tipo);
}

export const MESES_RETENCAO_NOTIFICACOES = 6;
