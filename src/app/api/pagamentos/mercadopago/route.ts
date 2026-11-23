import { after, NextResponse } from 'next/server';
import { validarAssinatura } from '@/server/pagamentos/assinatura';
import { processarAvisoGravado, registrarAviso } from '@/server/pagamentos/cobrancas';

/**
 * Aviso (webhook) do Mercado Pago, tópico "order" (docs/27).
 *  1. confere a assinatura `x-signature` com MP_WEBHOOK_SECRET (401 se não conferir: o MP tenta de novo);
 *  2. grava o aviso com o `x-request-id` único (repetido = 200 sem fazer nada); aviso do outro ambiente (`live_mode`
 *     diferente de MP_AMBIENTE) é registrado e ignorado, com alerta ao gestor;
 *  3. responde 200 na hora e, depois da resposta, consulta a order na API e aplica (o corpo do aviso nunca vale sozinho).
 * Sem IP fixo do MP: a assinatura é a defesa. Avisos de outros tópicos são aceitos e ignorados.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const texto = await req.text().catch(() => '');
  if (texto.length > 64_000) return new NextResponse(null, { status: 413 });
  let corpo: { type?: string; action?: string; live_mode?: boolean; data?: { id?: string | number } } = {};
  try { corpo = texto ? JSON.parse(texto) : {}; } catch { /* corpo vazio ou torto: vale a query */ }

  const tipo = url.searchParams.get('type') ?? url.searchParams.get('topic') ?? corpo.type ?? '';
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? (corpo.data?.id != null ? String(corpo.data.id) : null);
  const requestId = req.headers.get('x-request-id');

  const assinatura = validarAssinatura({
    segredo: [process.env.MP_WEBHOOK_SECRET, process.env.MP_WEBHOOK_SECRET_ANTERIOR],
    assinatura: req.headers.get('x-signature'), requestId, dataId,
  });
  if (!assinatura.ok) {
    console.warn('Pagamento: aviso do Mercado Pago recusado', assinatura.motivo, tipo, dataId);
    return NextResponse.json({ ok: false }, { status: assinatura.motivo === 'sem_segredo' ? 503 : 401 });
  }
  if (tipo !== 'order' || !dataId || !/^[A-Za-z0-9_-]{1,64}$/.test(dataId)) return NextResponse.json({ ok: true, ignorado: true });

  const evento = await registrarAviso({ orderId: dataId, requestId, acao: corpo.action ?? null, liveMode: typeof corpo.live_mode === 'boolean' ? corpo.live_mode : null });
  if (evento === 'repetido') return NextResponse.json({ ok: true, repetido: true });
  if (evento === 'ambiente_errado') return NextResponse.json({ ok: true, ignorado: true });
  // Depois da resposta: consulta a order e aplica. Falhou, o aviso fica pendente e a conciliação reprocessa (R-04).
  after(() => processarAvisoGravado(evento));
  return NextResponse.json({ ok: true });
}
