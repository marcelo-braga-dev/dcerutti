import { NextResponse } from 'next/server';
import { ArquivoInvalido, salvarFotoProduto, TAMANHO_MAXIMO } from '@/server/arquivos';
import { usuarioAtual } from '@/server/permissoes';

/** Recebe uma foto de produto (multipart: `referencia` + `arquivo`) e grava no servidor. Só gestor. */
export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (u?.papel !== 'gestor') return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  const referencia = String(fd?.get('referencia') ?? '').trim();
  const arquivo = fd?.get('arquivo');
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Escolha uma foto.' }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO) return NextResponse.json({ erro: 'Foto acima de 8 MB.' }, { status: 413 });
  try {
    return NextResponse.json({ publica: await salvarFotoProduto(referencia, Buffer.from(await arquivo.arrayBuffer())) });
  } catch (e) {
    if (e instanceof ArquivoInvalido) return NextResponse.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}
