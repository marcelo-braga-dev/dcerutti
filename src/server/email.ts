import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * E-mail transacional (B-03). Configuração no .env:
 *   SMTP_URL="smtps://usuario:senha@smtp.exemplo.com:465"   (Resend, Brevo, SMTP do domínio...)
 *   EMAIL_REMETENTE="D'Cerutti <nao-responda@dcerutti.com.br>"
 * Sem SMTP_URL (ambiente de teste), a mensagem vai para o log do servidor em vez de ser enviada.
 */
let transporte: Transporter | null = null;

export const emailConfigurado = () => !!process.env.SMTP_URL;

export async function enviarEmail(m: { para: string; assunto: string; texto: string }) {
  if (!emailConfigurado()) {
    console.warn(`[e-mail não enviado: SMTP_URL ausente] Para: ${m.para} · ${m.assunto}\n${m.texto}`);
    return;
  }
  transporte ??= nodemailer.createTransport(process.env.SMTP_URL);
  await transporte.sendMail({ from: process.env.EMAIL_REMETENTE || 'D’Cerutti <nao-responda@dcerutti.com.br>', to: m.para, subject: m.assunto, text: m.texto });
}
