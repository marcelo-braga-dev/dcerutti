import 'server-only';
import { z } from 'zod';
import { bloqueio, INTERESSE_POR_IP, INTERESSE_POR_TELEFONE, ipDoCliente, registrarFalha } from './limite';
import { celularValido, somenteDigitos } from '@/lib/telefone';

/** Formulário público (peça e vitrine, docs/26): os campos de contato e o limite, iguais nos dois. */
export const campoContatoPublico = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome longo demais.'),
  telefone: z.string().refine(celularValido, 'Informe o WhatsApp com DDD e 9 dígitos.').transform(somenteDigitos),
  aceite: z.literal(true, 'Para continuar, aceite o contato da loja.'),
});

/** Conta o envio e devolve a mensagem se passou do limite. O pedido público não mexe em estoque, mas não pode encher a fila. */
export async function barrarInteresse(telefone: string) {
  const chaveIp = `interesse:ip:${await ipDoCliente()}`, chaveTelefone = `interesse:tel:${telefone}`;
  if (bloqueio(chaveIp, INTERESSE_POR_IP) || bloqueio(chaveTelefone, INTERESSE_POR_TELEFONE)) return 'Muitos pedidos em pouco tempo. Tente de novo mais tarde ou chame a loja no WhatsApp.';
  registrarFalha(chaveIp, INTERESSE_POR_IP);
  registrarFalha(chaveTelefone, INTERESSE_POR_TELEFONE);
  return null;
}
