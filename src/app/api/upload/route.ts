import { NextResponse } from 'next/server';
import { usuarioAtual } from '@/server/permissoes';
import { r2Configurado, urlDeEnvio } from '@/server/r2';

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

/** Devolve uma URL pré-assinada para o navegador enviar a foto direto ao R2. Só gestor. */
export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (u?.papel !== 'gestor') return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  if (!r2Configurado()) return NextResponse.json({ erro: 'Armazenamento de imagens não configurado.' }, { status: 501 });
  const { referencia, tipo } = await req.json().catch(() => ({}));
  const ext = TIPOS[tipo];
  if (!ext || typeof referencia !== 'string' || !/^[\w-]{1,20}$/.test(referencia)) return NextResponse.json({ erro: 'Arquivo inválido.' }, { status: 400 });
  const chave = `produtos/${referencia.toUpperCase()}/${Date.now().toString(36)}.${ext}`;
  return NextResponse.json(await urlDeEnvio(chave, tipo));
}
