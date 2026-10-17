/**
 * Acompanhamento da equipe (D-26) — lógica pura: o nome de cada ação, os grupos da tabela e o resumo por pessoa.
 * O registro fica em src/server/equipe.ts; a tela, em /painel/equipe.
 */

export type Acao =
  | 'login' | 'cliente_cadastrado' | 'cliente_editado' | 'pedido_criado' | 'oferta_enviada' | 'pedido_editado'
  | 'pedido_confirmado' | 'pedido_cancelado' | 'venda_desfeita' | 'venda_balcao' | 'venda_caixa' | 'venda_manual'
  | 'venda_excluida' | 'cupom_pedido' | 'whatsapp' | 'cupom_enviado' | 'convite_enviado';

export type Grupo = 'acesso' | 'clientes' | 'pedidos' | 'contatos' | 'vendas';

export const ACOES: Record<Acao, { rotulo: string; grupo: Grupo }> = {
  login: { rotulo: 'Entrou', grupo: 'acesso' },
  cliente_cadastrado: { rotulo: 'Cadastrou cliente', grupo: 'clientes' },
  cliente_editado: { rotulo: 'Editou cliente', grupo: 'clientes' },
  pedido_criado: { rotulo: 'Montou pedido', grupo: 'pedidos' },
  oferta_enviada: { rotulo: 'Enviou sugestões', grupo: 'contatos' },
  pedido_editado: { rotulo: 'Alterou pedido', grupo: 'pedidos' },
  pedido_confirmado: { rotulo: 'Confirmou pedido', grupo: 'vendas' },
  pedido_cancelado: { rotulo: 'Cancelou pedido', grupo: 'pedidos' },
  venda_desfeita: { rotulo: 'Desfez venda', grupo: 'vendas' },
  venda_balcao: { rotulo: 'Venda na loja', grupo: 'vendas' },
  venda_caixa: { rotulo: 'Venda no caixa', grupo: 'vendas' },
  venda_manual: { rotulo: 'Registrou venda', grupo: 'vendas' },
  venda_excluida: { rotulo: 'Excluiu venda', grupo: 'vendas' },
  cupom_pedido: { rotulo: 'Cupom no pedido', grupo: 'pedidos' },
  whatsapp: { rotulo: 'Chamou no WhatsApp', grupo: 'contatos' },
  cupom_enviado: { rotulo: 'Enviou cupom', grupo: 'contatos' },
  convite_enviado: { rotulo: 'Enviou convite', grupo: 'contatos' },
};

export const ehAcao = (v: unknown): v is Acao => typeof v === 'string' && v in ACOES;

/** Sem sinal há mais que isso: a sessão terminou e a pessoa não está mais com o painel aberto. */
export const MINUTOS_SESSAO = 5;
export const MESES_RETENCAO_EQUIPE = 13;

export type ResumoPessoa = {
  diasAtivos: number;
  segundos: number;
  logins: number;
  clientes: number;
  pedidos: number;
  contatos: number;
  vendasConfirmadas: number;
  cancelamentos: number;
  /** Segundos ativos por dia (AAAA-MM-DD), para a faixa da tabela. */
  porDia: Map<string, number>;
  ultimaAcao: Date | null;
};

export const resumoVazio = (): ResumoPessoa => ({ diasAtivos: 0, segundos: 0, logins: 0, clientes: 0, pedidos: 0, contatos: 0, vendasConfirmadas: 0, cancelamentos: 0, porDia: new Map(), ultimaAcao: null });

/**
 * Resumo de cada pessoa no período: dias com uso, tempo ativo, logins e as ações por grupo. `dia` converte a data no
 * dia da loja (fuso de São Paulo). Clientes conta só cadastros; pedidos, os montados; contatos, envios e conversas no
 * WhatsApp; vendas confirmadas, confirmações e vendas no caixa, na loja e manuais.
 */
export function resumirEquipe(
  sessoes: { usuarioId: string; inicioEm: Date; segundos: number }[],
  acoes: { usuarioId: string; tipo: Acao; criadoEm: Date }[],
  dia: (d: Date) => string,
): Map<string, ResumoPessoa> {
  const r = new Map<string, ResumoPessoa>();
  const de = (id: string) => { let x = r.get(id); if (!x) r.set(id, (x = resumoVazio())); return x; };
  for (const s of sessoes) {
    const x = de(s.usuarioId);
    x.segundos += s.segundos;
    const d = dia(s.inicioEm);
    x.porDia.set(d, (x.porDia.get(d) ?? 0) + s.segundos);
  }
  for (const a of acoes) {
    const x = de(a.usuarioId);
    if (!x.ultimaAcao || a.criadoEm > x.ultimaAcao) x.ultimaAcao = a.criadoEm;
    if (a.tipo === 'login') x.logins++;
    else if (a.tipo === 'cliente_cadastrado') x.clientes++;
    else if (a.tipo === 'pedido_criado') x.pedidos++;
    else if (a.tipo === 'pedido_cancelado') x.cancelamentos++;
    else if (['pedido_confirmado', 'venda_caixa', 'venda_balcao', 'venda_manual'].includes(a.tipo)) x.vendasConfirmadas++;
    if (ACOES[a.tipo].grupo === 'contatos') x.contatos++;
    // Um dia com ação também é dia ativo, mesmo sem sinal de presença (o sinal começou depois, ou a aba ficou oculta).
    if (!x.porDia.has(dia(a.criadoEm))) x.porDia.set(dia(a.criadoEm), 0);
  }
  for (const x of r.values()) x.diasAtivos = x.porDia.size;
  return r;
}

/** "2 h 15 min", "45 min", "menos de 1 min". */
export function duracao(seg: number) {
  if (seg < 60) return seg > 0 ? 'menos de 1 min' : '—';
  const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** Online: o último sinal do painel ou do caixa chegou há menos de 3 minutos. */
export const online = (ultimoAcesso: Date | null | undefined, agora = Date.now()) => !!ultimoAcesso && agora - ultimoAcesso.getTime() < 3 * 60_000;
