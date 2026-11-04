import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import type { Imagem } from '@/lib/identidade';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeInstagram } from '@/components/ui/icones';
import { IconeWhatsApp } from './previa-whatsapp';

const LOJA = [
  ['Novidades', '/catalogo?ordem=novidades'], ['Feminino', '/catalogo?genero=feminino'], ['Masculino', '/catalogo?genero=masculino'],
  ['Promoções', '/catalogo?promo=1'], ['Imperdível', '/catalogo?imperdivel=1'], ['Todas as peças', '/catalogo'],
];

export function Rodape({ whatsapp, cidade, logo, nome, slogan }: { whatsapp: string; cidade: string; logo: Imagem; nome: string; slogan: string }) {
  const zap = linkWhatsApp(whatsapp, `Olá! Vim pelo catálogo da ${nome}.`);
  return (
    <footer className="mt-24 bg-marrom-950 text-areia rounded-t-[2rem] sm:rounded-t-[3rem]">
      {/* Chamada final: atendimento de pessoa para pessoa. */}
      <div className="mx-auto max-w-[1440px] px-5 sm:px-10 pt-14 sm:pt-16">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center pb-12 border-b border-creme/10">
          <div>
            <p className="titulo !text-creme text-3xl sm:text-4xl leading-tight">Ficou com dúvida? <em className="text-areia">A gente te ajuda.</em></p>
            <p className="mt-3 max-w-xl text-areia/90">Tamanho, cor ou uma peça que você não achou: fale com uma pessoa da loja pelo WhatsApp.</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <a href={zap} target="_blank" rel="noopener" className="h-12 px-6 inline-flex items-center gap-2 rounded-full bg-whatsapp text-white font-semibold hover:bg-whatsapp-escuro transition-colors"><IconeWhatsApp className="size-5" />Falar no WhatsApp</a>
            <a href="https://instagram.com/dcerutti_" target="_blank" rel="noopener" className="h-12 px-6 inline-flex items-center gap-2 rounded-full border border-creme/25 text-creme font-semibold hover:bg-creme/10 transition-colors"><IconeInstagram className="size-5" />@dcerutti_</a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-5 sm:px-10 py-12 grid gap-10 grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="col-span-2 lg:col-span-1 grid content-start gap-4">
          <div>
            <Logo img={logo} alt={nome} className="h-14 w-auto" />
            {slogan && <p className="mt-2 text-sm italic font-[family-name:var(--font-titulo)] text-areia">{slogan}</p>}
          </div>
          <p className="text-sm leading-relaxed max-w-xs">Moda Hering e John John com estoque pronto em {cidade} (SC) e atendimento de pessoa para pessoa.</p>
        </div>
        <nav className="grid content-start gap-3 text-sm" aria-label="Loja">
          <span className="text-creme font-semibold mb-1">Loja</span>
          {LOJA.map(([rotulo, href]) => <Link key={href} href={href} className="hover:text-creme transition-colors">{rotulo}</Link>)}
        </nav>
        <nav className="grid content-start gap-3 text-sm" aria-label="Atendimento">
          <span className="text-creme font-semibold mb-1">Atendimento</span>
          <a href={zap} target="_blank" rel="noopener" className="hover:text-creme transition-colors">WhatsApp {formatarTelefone(whatsapp)}</a>
          <Link href="/minha-conta/pedidos" className="hover:text-creme transition-colors">Meus pedidos</Link>
          <Link href="/minha-conta" className="hover:text-creme transition-colors">Minha conta</Link>
          <Link href="/privacidade" className="hover:text-creme transition-colors">Política de privacidade</Link>
        </nav>
        <div className="col-span-2 lg:col-span-1 grid content-start gap-3 text-sm">
          <span className="text-creme font-semibold mb-1">Como funciona</span>
          {['Monte sua sacola no catálogo.', 'Envie o pedido para quem te atende pelo WhatsApp.', 'Combine pagamento e entrega, ou peça um condicional e prove em casa.'].map((t, i) => (
            <div key={t} className="flex gap-3 items-start"><span className="size-6 shrink-0 grid place-items-center rounded-full bg-creme/10 text-creme text-xs font-bold">{i + 1}</span><span>{t}</span></div>
          ))}
        </div>
      </div>
      <div className="border-t border-creme/10">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-10 py-5 flex flex-wrap justify-between gap-2 text-xs text-areia/80">
          <span>© {new Date().getFullYear()} {nome} · {cidade} (SC) · CNPJ 42.388.147/0001-40</span>
          <span>Preços e estoque sujeitos a alteração; confirmados no atendimento.</span>
        </div>
      </div>
    </footer>
  );
}
