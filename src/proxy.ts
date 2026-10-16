import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { CABECALHO_CAMINHO } from '@/lib/url';

const PROTEGIDAS = ['/painel', '/minha-conta', '/caixa'];

/**
 * Checagem otimista: sem cookie de sessão, painel e minha-conta vão para /entrar?volta=<caminho com filtros>.
 * A verificação real (sessão válida, papel, catálogo público ou não) acontece nos layouts e Server Actions.
 * Por isso a loja não é bloqueada aqui: se `catalogo_publico` estiver ligado, visitantes podem entrar.
 */
export function proxy(req: NextRequest) {
  const caminho = req.nextUrl.pathname + req.nextUrl.search;
  if (PROTEGIDAS.some(p => req.nextUrl.pathname.startsWith(p)) && !getSessionCookie(req)) {
    const url = new URL('/entrar', req.url);
    url.searchParams.set('volta', caminho);
    return NextResponse.redirect(url);
  }
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set(CABECALHO_CAMINHO, caminho);
  return NextResponse.next({ request: { headers: cabecalhos } });
}

// Páginas apenas: nada de API, arquivos estáticos, otimizador de imagens, fotos ou arquivos de /public.
export const config = { matcher: ['/((?!api|_next/static|_next/image|arquivos|ambiente|favicon.ico|icone.svg|logo-dcerutti.png|logo-dcerutti-claro.png|\\.well-known).*)'] };
