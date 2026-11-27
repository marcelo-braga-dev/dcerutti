/** Cor da meta (src/server/relatorios.ts → corDaMeta): bateu, perto, longe. */
export const corDaMeta = (pct: number) => (pct >= 100 ? 'success.main' : pct >= 60 ? 'secondary.main' : 'error.main');
