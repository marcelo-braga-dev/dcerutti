import type { Metadata, Viewport } from 'next';
import { Archivo, Hanken_Grotesk } from 'next/font/google';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', weight: ['500', '700', '800'] });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: "D'Cerutti — O básico aconchego", template: "%s · D'Cerutti" },
  description: 'Catálogo D’Cerutti: Hering, Hering Sports e Hering Intimates com estoque pronto em Maravilha (SC).',
  // D-09: catálogo privado — nada deve ser indexado enquanto não abrir ao público.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#2e2520', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${hanken.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
