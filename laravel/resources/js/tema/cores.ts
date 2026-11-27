/**
 * Cores da identidade visual (D-25), as mesmas de src/lib/identidade.ts do sistema em Next. O gestor muda algumas em
 * Identidade; o servidor manda só as mudadas (props compartilhadas `identidade.cores`) e o resto vale o padrão.
 */
export type Token =
  | 'marrom-950' | 'caramelo' | 'creme' | 'card' | 'marrom-900' | 'oliva' | 'imperdivel'
  | 'marrom-700' | 'vermelho' | 'areia' | 'bege' | 'borda' | 'borda-forte' | 'suave';

export const CORES_PADRAO: Record<Token, string> = {
  'marrom-950': '#2e2520', caramelo: '#6d402a', creme: '#f6f2ec', card: '#fffdf9', 'marrom-900': '#3a2e27', oliva: '#5e6b43',
  imperdivel: '#e3261b', suave: '#76685d', vermelho: '#b8462f', areia: '#ddcdb3', bege: '#efe4d6', borda: '#e6dccd',
  'borda-forte': '#cfc2b2', 'marrom-700': '#4a2b1c',
};

/** Cores fixas (não editáveis). */
export const WHATSAPP = { principal: '#187a48', escuro: '#11613a', balao: '#e7f6dd' };

export const coresDa = (mudadas: Partial<Record<Token, string>> | undefined) => ({ ...CORES_PADRAO, ...mudadas });
