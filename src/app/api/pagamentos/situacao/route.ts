import { after, NextResponse } from 'next/server';
import { codigoDaChavePagamento } from '@/server/link-pedido';
import { bloqueio, ipDoCliente, registrarFalha, SITUACAO_PAGAMENTO_POR_IP } from '@/server/limite';
import { situacaoParaPagina } from '@/server/consultas/pagamentos';
import { sincronizarCobranca, talvezConciliar } from '@/server/pagamentos/cobrancas';

/**
 * Situação do pagamento para a página /pagar (o Pix pergunta a cada 5 s). Pela chave assinada, sem login. Se a cobrança
 * está aberta, consulta o Mercado Pago no máximo a cada 15 s: o pagamento aparece mesmo que o aviso atrase.
 */
export async function GET(req: Request) {
  const sem = { 'Cache-Control': 'no-store' };
  const codigo = codigoDaChavePagamento(new URL(req.url).searchParams.get('chave'));
  if (!codigo) return NextResponse.json({ ok: false }, { status: 404, headers: sem });
  const chave = `situacao-pgto:${await ipDoCliente()}`;
  if (bloqueio(chave, SITUACAO_PAGAMENTO_POR_IP)) return NextResponse.json({ ok: false }, { status: 429, headers: sem });
  registrarFalha(chave, SITUACAO_PAGAMENTO_POR_IP);
  let s = await situacaoParaPagina(codigo);
  if (!s) return NextResponse.json({ ok: false }, { status: 404, headers: sem });
  if (s.ativa?.temOrder) {
    try {
      if (await sincronizarCobranca(s.ativa.id, 'consulta', 15)) s = await situacaoParaPagina(codigo);
    } catch {
      // Mercado Pago fora do ar: responde o que se sabe.
    }
  }
  after(() => talvezConciliar());
  return NextResponse.json({ ok: true, pago: s!.pago, aberta: !!s!.ativa, situacao: s!.ativa?.status ?? s!.ultima, expiraEm: s!.ativa?.expiraEm ?? null }, { headers: sem });
}
