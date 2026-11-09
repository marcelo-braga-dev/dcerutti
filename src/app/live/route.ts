import { NextResponse } from 'next/server';
import { destinoDaLive, vitrinesLigadas } from '@/server/consultas/vitrines';

/** Endereço curto para falar na live e escrever na legenda (docs/26): leva à live no ar, à próxima ou a /vitrines. */
export async function GET() {
  if (!(await vitrinesLigadas())) return new NextResponse('Não encontrado', { status: 404 });
  // Endereço relativo: vale o domínio que a pessoa abriu, atrás do Nginx.
  return new NextResponse(null, { status: 307, headers: { Location: await destinoDaLive(), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
