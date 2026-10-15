/**
 * Paleta da marca para onde CSS não chega (canvas da imagem do pedido, metadados).
 * Espelha os tokens de src/app/globals.css: mudou lá, mude aqui.
 */
export const COR = {
  marrom950: '#2e2520',
  caramelo: '#6d402a',
  oliva: '#5e6b43',
  vermelho: '#b8462f',
  areia: '#ddcdb3',
  creme: '#f6f2ec',
  card: '#fffdf9',
  bege: '#efe4d6',
  borda: '#e6dccd',
  suave: '#76685d',
  whatsapp: '#187a48',
} as const;

/** Cor de desempenho em telas (variáveis CSS do tema): bom, atenção, ruim. */
export const TOM = { bom: 'var(--color-oliva)', atencao: 'var(--color-caramelo)', ruim: 'var(--color-vermelho)', neutro: 'var(--color-suave)' } as const;
