import 'server-only';

/**
 * Q-05, revisto em 15/10/2026 (D-17): pedido ou condicional pendente há mais de `diasExpiracao` dias **não** é mais
 * cancelado sozinho. Ele aparece como "Prazo vencido" para a equipe, que cancela pelo botão (a reserva volta ao
 * estoque nessa hora) ou fecha normalmente.
 */
export { expiraEm, prazoVencido } from '@/lib/pedido';
