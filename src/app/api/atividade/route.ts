import { after, NextResponse } from 'next/server';
import { bloqueio, ATIVIDADE_POR_CLIENTE, registrarFalha } from '@/server/limite';
import { esquemaEventos, registrarEventos, talvezManutencao } from '@/server/navegacao';
import { usuarioAtual } from '@/server/permissoes';

/**
 * Histórico do cliente (docs/21): recebe os eventos da loja em lote (navigator.sendBeacon, corpo JSON em text/plain).
 * Só a cliente logada; quem ela é vem da sessão, nunca do corpo. Responde 204 mesmo quando não grava nada.
 */
export async function POST(req: Request) {
  const origem = req.headers.get('origin');
  if (origem && new URL(origem).host !== req.headers.get('host')) return new NextResponse(null, { status: 403 });
  const u = await usuarioAtual();
  if (u?.papel !== 'cliente') return new NextResponse(null, { status: 204 });
  const chave = `atividade:${u.id}`;
  if (bloqueio(chave, ATIVIDADE_POR_CLIENTE)) return new NextResponse(null, { status: 429 });
  registrarFalha(chave, ATIVIDADE_POR_CLIENTE); // conta cada lote, não só os errados
  const texto = await req.text().catch(() => '');
  if (texto.length > 32_000) return new NextResponse(null, { status: 413 });
  let corpo: unknown;
  try { corpo = JSON.parse(texto); } catch { return new NextResponse(null, { status: 400 }); }
  const r = esquemaEventos.safeParse((corpo as { eventos?: unknown })?.eventos);
  if (!r.success) return new NextResponse(null, { status: 400 });
  try {
    await registrarEventos(u.id, r.data, req.headers.get('user-agent'));
  } catch (e) {
    console.error('Falha ao registrar a navegação', e);
  }
  after(() => talvezManutencao());
  return new NextResponse(null, { status: 204 });
}
