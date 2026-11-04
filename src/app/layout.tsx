import type { Metadata, Viewport } from 'next';
import { Archivo, Fraunces, Hanken_Grotesk, Plus_Jakarta_Sans } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';
import { ProvedorLoja } from '@/components/ui/provedor-loja';
import { marcaAtual } from '@/server/marca';

const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', weight: ['500', '700', '800'] });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', weight: ['400', '500', '600', '700'] });
// Loja (visual 2026): Fraunces nos títulos, Plus Jakarta Sans no texto, botões e preços.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['SOFT', 'opsz'], style: ['normal', 'italic'] });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const { favicon, nome, nomeComSlogan } = await marcaAtual();
  return {
    title: { default: nomeComSlogan, template: `%s · ${nome}` },
    description: `Catálogo ${nome}: Hering, Hering Sports e Hering Intimates com estoque pronto em Maravilha (SC).`,
    // D-09: catálogo privado — nada deve ser indexado enquanto não abrir ao público.
    robots: { index: false, follow: false },
    // D-25: favicon enviado pelo gestor; sem ele, o ícone de fábrica.
    icons: favicon ? { icon: { url: favicon.url, type: 'image/png' }, apple: favicon.url } : { icon: { url: '/icone.svg', type: 'image/svg+xml' } },
  };
}

export async function generateViewport(): Promise<Viewport> {
  await connection();
  return { themeColor: (await marcaAtual()).cores['marrom-950'], width: 'device-width', initialScale: 1 };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A identidade visual vem do banco a cada página (D-25): nada é pré-gerado no build com as cores antigas.
  await connection();
  const marca = await marcaAtual();
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${hanken.variable} ${fraunces.variable} ${jakarta.variable}`} data-logo={marca.logo.url} data-loja={marca.nome} data-slogan={marca.slogan}>
      <head>{marca.css ? <style id="tema">{marca.css}</style> : null}</head>
      <body className="min-h-dvh antialiased"><ProvedorLoja nome={marca.nome} slogan={marca.slogan}>{children}</ProvedorLoja></body>
    </html>
  );
}
