import { db } from '@/server/db';

/** Monitor externo (UptimeRobot etc.): 200 com o banco respondendo, 503 sem banco. Não expõe detalhes. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
