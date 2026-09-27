import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Checagem otimista: sem cookie de sessão, manda para /entrar.
 * A verificação real (sessão válida, papel, catálogo público ou não) acontece nos layouts e Server Actions.
 * Por isso a loja não é bloqueada aqui: se `catalogo_publico` estiver ligado, visitantes podem entrar.
 */
export function proxy(req: NextRequest) {
  if (!getSessionCookie(req)) {
    const url = new URL('/entrar', req.url);
    url.searchParams.set('volta', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/painel/:path*', '/minha-conta/:path*'] };
