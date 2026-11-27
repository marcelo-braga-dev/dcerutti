/**
 * Nome e assinatura da loja (D-25, Identidade visual). Usados em títulos, mensagens do WhatsApp, e-mails e imagens.
 * No navegador vêm do <html data-loja data-slogan> (layout raiz); no servidor, da última leitura da configuração
 * (`lerConfig` chama `lembrarLoja`). Como é a mesma loja para todos, guardar no módulo não mistura pedidos.
 */
export const NOME_PADRAO = 'D’Cerutti';
export const SLOGAN_PADRAO = 'O básico aconchego';

let doServidor = { nome: NOME_PADRAO, slogan: SLOGAN_PADRAO };

export function lembrarLoja(v: { nome?: string | null; slogan?: string | null }) {
  doServidor = { nome: v.nome || NOME_PADRAO, slogan: v.slogan ?? SLOGAN_PADRAO };
}

const doHtml = (chave: 'loja' | 'slogan') => (typeof document === 'undefined' ? undefined : document.documentElement.dataset[chave]);

export const nomeDaLoja = () => doHtml('loja') || doServidor.nome;
export const sloganDaLoja = () => doHtml('slogan') ?? doServidor.slogan;
/** "D’Cerutti — O básico aconchego", ou só o nome sem assinatura. */
export const nomeComSlogan = () => (sloganDaLoja() ? `${nomeDaLoja()} — ${sloganDaLoja()}` : nomeDaLoja());
