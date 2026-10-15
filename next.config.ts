import type { NextConfig } from 'next';
import { HOSTS_IMAGENS } from './src/lib/imagens';

const dev = process.env.NODE_ENV === 'development';

// C-04. CSP sem nonce (o guia do Next permite 'unsafe-inline' para os scripts dele). Fotos de produto podem vir de
// qualquer https (<Foto> usa <img> para hosts fora do otimizador). Fotos enviadas ficam no próprio servidor (/arquivos).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: HOSTS_IMAGENS.map(hostname => ({ protocol: 'https' as const, hostname })),
    // Só estes caminhos locais passam pelo otimizador, e sem query string.
    localPatterns: [
      { pathname: '/arquivos/**', search: '' },
      { pathname: '/ambiente/**', search: '' },
      { pathname: '/logo-dcerutti.png', search: '' },
      { pathname: '/logo-dcerutti-claro.png', search: '' },
    ],
    // Só WebP: codificar AVIF consumia memória demais (B-02: picos acima de 1 GB com 16 fotos simultâneas).
    formats: ['image/webp'],
    // As fotos têm nome único e nunca mudam: o otimizador pode guardar o resultado por 30 dias.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Sem cache de operações do sharp em memória (o resultado já fica em disco, em .next/cache/images).
    imgOptOperationCache: false,
    // VPS com pouca memória: um worker só no build.
    cpus: 1,
  },
};

export default nextConfig;
