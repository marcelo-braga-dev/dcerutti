import type { MetadataRoute } from 'next';

/**
 * D-09: catálogo privado. Nenhuma página deve ser indexada (o layout já marca tudo com `noindex`); o robots.txt
 * diz o mesmo aos buscadores. Ao abrir o catálogo ao público, liberar a loja aqui e criar o sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
