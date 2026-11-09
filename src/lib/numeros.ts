/**
 * Números de WhatsApp da loja (D-31) — regras puras: qual número atende a cliente e as situações do vínculo.
 * O número é da loja, não da pessoa: a gestora liga e desliga as pessoas em /painel/numeros.
 */

export type StatusNumero = 'ativo' | 'pausado' | 'desativado';
export type NumeroResumo = { telefone: string; status: StatusNumero | string };

/** Seleção do vendedor para `contatoDe`. */
export const VENDEDOR_CONTATO = { name: true, ativo: true, numeroPrincipal: { select: { telefone: true, status: true } } } as const;

/** Só número ativo atende: pausado ou desativado cai no padrão da loja. */
export const numeroEmUso = (n: { status: string } | null | undefined) => n?.status === 'ativo';

/**
 * Para onde a cliente fala: o número principal da vendedora, se ela estiver ativa e o número em uso (`nome` é a
 * vendedora); senão, o número padrão da loja (`nome` null).
 */
export function contatoDe(vendedor: { name: string; ativo?: boolean; numeroPrincipal?: NumeroResumo | null } | null | undefined, padrao: string): { telefone: string; nome: string | null } {
  if (vendedor && vendedor.ativo !== false && numeroEmUso(vendedor.numeroPrincipal)) return { telefone: vendedor.numeroPrincipal!.telefone, nome: vendedor.name };
  return { telefone: padrao, nome: null };
}

/**
 * Referência para o aviso de muitas pessoas num número: fontes não oficiais citam 1 celular principal + 4 conectados
 * no WhatsApp Business, e mais só em plano pago. É só um aviso: conferir na Central de Ajuda do WhatsApp.
 */
export const LIMITE_APARELHOS = 5;

export const ROTULO_STATUS: Record<StatusNumero, string> = { ativo: 'Ativo', pausado: 'Pausado', desativado: 'Desativado' };

/** Situação do vínculo: sem a API o sistema não vê o aparelho, então conexão e desconexão são confirmadas pela gestora. */
export function situacaoVinculo(v: { conexao: string; fimEm: Date | string | null; desconectadoEm: Date | string | null }) {
  if (!v.fimEm) return v.conexao === 'conectado' ? 'Aparelho conectado' : 'Aguardando conexão';
  return v.desconectadoEm ? 'Encerrado' : 'Aguardando desconexão';
}
