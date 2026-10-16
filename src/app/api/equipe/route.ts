import { after, NextResponse } from 'next/server';
import { ATIVIDADE_POR_EQUIPE, bloqueio, registrarFalha } from '@/server/limite';
import { esquemaSinal, registrarEnvio, registrarPresenca } from '@/server/equipe';
import { talvezManutencao } from '@/server/navegacao';
import { EQUIPE, usuarioAtual } from '@/server/permissoes';

/**
 * Acompanhamento da equipe (D-26): o painel e o caixa mandam um sinal por minuto com o tempo visível, e os envios pelo
 * WhatsApp. Quem é vem da sessão, nunca do corpo. Responde 204 mesmo quando não grava nada.
 */
export async function POST(req: Request) {
  const origem = req.headers.get('origin');
  if (origem && new URL(origem).host !== req.headers.get('host')) return new NextResponse(null, { status: 403 });
  const u = await usuarioAtual();
  if (!u || !EQUIPE.includes(u.papel)) return new NextResponse(null, { status: 204 });
  const chave = `equipe:${u.id}`;
  if (bloqueio(chave, ATIVIDADE_POR_EQUIPE)) return new NextResponse(null, { status: 429 });
  registrarFalha(chave, ATIVIDADE_POR_EQUIPE);
  const texto = await req.text().catch(() => '');
  if (texto.length > 8_000) return new NextResponse(null, { status: 413 });
  let corpo: unknown;
  try { corpo = JSON.parse(texto); } catch { return new NextResponse(null, { status: 400 }); }
  const r = esquemaSinal.safeParse(corpo);
  if (!r.success) return new NextResponse(null, { status: 400 });
  const ua = req.headers.get('user-agent');
  try {
    if (r.data.seg != null) await registrarPresenca(u.id, r.data.seg, ua);
    for (const e of r.data.envios ?? []) await registrarEnvio(u, e, ua);
  } catch (e) {
    console.error('Falha ao registrar o sinal da equipe', e);
  }
  after(() => talvezManutencao());
  return new NextResponse(null, { status: 204 });
}
