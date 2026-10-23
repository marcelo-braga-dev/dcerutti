import { NextResponse } from 'next/server';
import { ArquivoInvalido, salvarVideoProduto, TAMANHO_MAXIMO_VIDEO } from '@/server/arquivos';
import { usuarioAtual } from '@/server/permissoes';

/**
 * Recebe um vídeo de produto (D-29) e grava no servidor. Só gestor. O corpo é o próprio arquivo (não multipart),
 * lido em partes direto para o disco; a referência vai na URL: POST /api/upload/video?referencia=<REF>.
 */
export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (u?.papel !== 'gestor') return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  const referencia = new URL(req.url).searchParams.get('referencia')?.trim() ?? '';
  if (Number(req.headers.get('content-length')) > TAMANHO_MAXIMO_VIDEO) return NextResponse.json({ erro: 'Vídeo acima de 100 MB.' }, { status: 413 });
  if (!req.body) return NextResponse.json({ erro: 'Escolha um vídeo.' }, { status: 400 });
  try {
    return NextResponse.json({ publica: await salvarVideoProduto(referencia, req.body) });
  } catch (e) {
    if (e instanceof ArquivoInvalido) return NextResponse.json({ erro: e.message }, { status: e.message.includes('100 MB') ? 413 : 400 });
    throw e;
  }
}
