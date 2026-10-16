import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import type { Imagem } from '@/lib/identidade';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeWhatsApp } from './previa-whatsapp';

const LOJA = [
  ['Feminino', '/catalogo?genero=feminino'], ['Masculino', '/catalogo?genero=masculino'], ['Novidades', '/catalogo?ordem=novidades'],
  ['Promoções', '/catalogo?promo=1'], ['Imperdível', '/catalogo?imperdivel=1'], ['Todas as peças', '/catalogo'],
];

export function Rodape({ whatsapp, cidade, logo, nome, slogan }: { whatsapp: string; cidade: string; logo: Imagem; nome: string; slogan: string }) {
  return (
    <footer className="mt-20 bg-marrom-950 text-areia">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.3fr]">
        <div className="grid content-start gap-4">
          <div>
            <Logo img={logo} alt={nome} className="h-14 w-auto" />
            {slogan && <p className="mt-1 rotulo">{slogan}</p>}
          </div>
          <p className="text-sm leading-relaxed max-w-xs">Moda Hering e John John com estoque pronto em {cidade} (SC), atendimento de pessoa para pessoa pelo WhatsApp.</p>
          <div className="flex gap-2">
            <a href={linkWhatsApp(whatsapp, `Olá! Vim pelo catálogo da ${nome}.`)} target="_blank" rel="noopener" aria-label="WhatsApp da loja" className="size-11 grid place-items-center border border-creme/20 hover:bg-creme/10"><IconeWhatsApp className="size-5" /></a>
            <a href="https://instagram.com/dcerutti_" target="_blank" rel="noopener" aria-label="Instagram @dcerutti_" className="size-11 grid place-items-center border border-creme/20 hover:bg-creme/10">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" /></svg>
            </a>
          </div>
        </div>
        <nav className="grid content-start gap-2.5 text-sm" aria-label="Loja">
          <span className="rotulo text-creme mb-1">Loja</span>
          {LOJA.map(([rotulo, href]) => <Link key={href} href={href} className="hover:text-creme">{rotulo}</Link>)}
        </nav>
        <nav className="grid content-start gap-2.5 text-sm" aria-label="Atendimento">
          <span className="rotulo text-creme mb-1">Atendimento</span>
          <a href={linkWhatsApp(whatsapp, `Olá! Vim pelo catálogo da ${nome}.`)} target="_blank" rel="noopener" className="hover:text-creme">WhatsApp {formatarTelefone(whatsapp)}</a>
          <a href="https://instagram.com/dcerutti_" target="_blank" rel="noopener" className="hover:text-creme">Instagram @dcerutti_</a>
          <Link href="/minha-conta/pedidos" className="hover:text-creme">Meus pedidos</Link>
          <Link href="/minha-conta" className="hover:text-creme">Minha conta</Link>
          <Link href="/privacidade" className="hover:text-creme">Política de privacidade</Link>
        </nav>
        <div className="grid content-start gap-3 text-sm">
          <span className="rotulo text-creme mb-1">Como funciona</span>
          {['Monte sua sacola no catálogo.', 'Envie o pedido para quem te atende pelo WhatsApp.', 'Combine pagamento e entrega, ou peça um condicional e prove em casa.'].map((t, i) => (
            <div key={t} className="flex gap-3"><span className="font-display font-extrabold text-creme">0{i + 1}</span><span>{t}</span></div>
          ))}
        </div>
      </div>
      <div className="border-t border-creme/10">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-5 flex flex-wrap justify-between gap-2 text-xs">
          <span>© {new Date().getFullYear()} {nome} · {cidade} (SC) · CNPJ 42.388.147/0001-40</span>
          <span>Preços e estoque sujeitos a alteração; confirmados no atendimento.</span>
        </div>
      </div>
    </footer>
  );
}
