import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { IconeInstagram } from '@/components/ui/icones';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { Logo } from '@/components/ui/logo';
import { Contagem } from '@/components/vitrine/contagem';
import { brl } from '@/lib/dinheiro';
import { formatarDataHora } from '@/lib/datas';
import { TIPOS_VITRINE } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';
import { lerConfig } from '@/server/config';
import { vitrinesPublicas } from '@/server/consultas/vitrines';
import { marcaAtual } from '@/server/marca';

export async function generateMetadata(): Promise<Metadata> {
  const { nome } = await marcaAtual();
  return { title: { absolute: `Vitrines · ${nome}` }, description: `Peças das lives e publicações da ${nome}: escolha o tamanho e peça pelo WhatsApp.`, robots: { index: false, follow: false } };
}

type Item = Awaited<ReturnType<typeof vitrinesPublicas>>['publicadas'][number];

/** Mosaico de até 3 fotos das peças: a capa da vitrine. */
function Mosaico({ v, alto }: { v: Item; alto?: boolean }) {
  const f = v.imagens.length ? v.imagens : [null];
  return (
    <div className={`relative grid gap-0.5 overflow-hidden bg-bege ${alto ? 'h-64 sm:h-72' : 'h-full'} ${f.length >= 3 ? 'grid-cols-[1.5fr_1fr] grid-rows-2' : f.length === 2 ? 'grid-cols-2' : ''}`}>
      {f.map((src, i) => (
        <div key={i} className={`relative overflow-hidden ${f.length >= 3 && i === 0 ? 'row-span-2' : ''}`}>
          <Foto src={src} alt="" sizes={alto ? '(min-width: 640px) 36rem, 100vw' : '160px'} prioridade={alto && i === 0} />
        </div>
      ))}
    </div>
  );
}

function Detalhes({ v }: { v: Item }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-suave">
      <span>{v.pecas} {v.pecas === 1 ? 'peça' : 'peças'}</span>
      {v.aPartirDe != null && <><span aria-hidden="true">·</span><span>a partir de <strong className="text-marrom-950">{brl(v.aPartirDe)}</strong></span></>}
      {v.descontoMax > 0 && <span className="h-6 px-2 rounded-full bg-imperdivel text-white text-[0.7rem] font-bold inline-flex items-center">até {v.descontoMax}% off</span>}
    </span>
  );
}

/**
 * Página do link da bio (docs/26, D-36): a live no ar (ou a próxima) em destaque, depois as vitrines ativas em cartões
 * com as fotos, quantas peças, "a partir de" e o desconto. Instagram e WhatsApp da loja no topo.
 */
export default async function Vitrines() {
  const cfg = await lerConfig();
  if (!cfg.vitrines.ligadas) notFound();
  const [{ noAr, proximas, publicadas }, marca] = await Promise.all([vitrinesPublicas(), marcaAtual()]);
  const destaque = noAr ?? proximas[0] ?? null;
  const outrasProximas = noAr ? proximas : proximas.slice(1);
  const vazio = !destaque && !publicadas.length;

  return (
    <main className="loja mx-auto max-w-xl px-4 pt-8 pb-12 grid gap-7">
      <header className="grid justify-items-center gap-3 text-center">
        <Logo img={marca.logo} className="h-16 w-auto mix-blend-multiply" prioridade />
        <p className="text-suave text-sm max-w-xs">Peças das nossas lives e publicações. Escolha o tamanho e peça pelo WhatsApp.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <a href={`https://www.instagram.com/${cfg.instagramLoja}/`} target="_blank" rel="noopener" className="h-10 px-4 rounded-full border border-borda-forte bg-card text-sm font-semibold inline-flex items-center gap-2 hover:border-marrom-950"><IconeInstagram className="size-4" /> @{cfg.instagramLoja}</a>
          <a href={linkWhatsApp(cfg.whatsappLoja, 'Oi! Vim pelo link da bio e queria ajuda com as peças.')} target="_blank" rel="noopener" className="h-10 px-4 rounded-full bg-whatsapp text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-whatsapp-escuro"><IconeWhatsApp className="size-4" /> Falar com a loja</a>
        </div>
      </header>

      {vazio && (
        <div className="bg-card border border-borda rounded-3xl p-8 text-center grid gap-2">
          <h2 className="titulo text-xl">Nenhuma vitrine no momento</h2>
          <p className="text-suave text-sm">Acompanhe a loja no Instagram: as próximas lives e novidades aparecem aqui.</p>
        </div>
      )}

      {destaque && (
        <section aria-label={destaque.status === 'no_ar' ? 'Ao vivo agora' : 'Próxima live'}>
          <Link href={`/vitrine/${encodeURIComponent(destaque.slug)}`} className="group block rounded-[2rem] overflow-hidden bg-marrom-950 text-creme shadow-xl shadow-marrom-950/15">
            <div className="relative">
              <Mosaico v={destaque} alto />
              <div className="absolute inset-0 bg-gradient-to-t from-marrom-950 via-marrom-950/30 to-transparent" />
              <div className="absolute left-4 top-4">
                {destaque.status === 'no_ar' ? (
                  <span className="h-7 pl-2.5 pr-3 rounded-full bg-imperdivel text-white text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2">
                    <span className="relative flex size-2"><span className="absolute inset-0 rounded-full bg-white animate-ping motion-reduce:animate-none" /><span className="relative size-2 rounded-full bg-white" /></span>
                    Ao vivo agora
                  </span>
                ) : (
                  <span className="h-7 px-3 rounded-full bg-card text-marrom-950 text-xs font-bold inline-flex items-center gap-1">
                    Próxima live{destaque.inicioPrevisto ? <> · <Contagem ate={destaque.inicioPrevisto.toISOString()} fim="começando" /></> : null}
                  </span>
                )}
              </div>
            </div>
            <div className="p-5 grid gap-2 -mt-14 relative">
              <h2 className="titulo !text-creme text-3xl leading-tight">{destaque.titulo}</h2>
              {destaque.status === 'agendada' && destaque.inicioPrevisto && <p className="text-sm text-areia">{formatarDataHora(destaque.inicioPrevisto)}</p>}
              <span className="text-sm text-areia">{destaque.pecas} {destaque.pecas === 1 ? 'peça' : 'peças'}{destaque.aPartirDe != null ? ` · a partir de ${brl(destaque.aPartirDe)}` : ''}</span>
              <span className="mt-2 h-11 rounded-full bg-creme text-marrom-950 text-sm font-semibold grid place-items-center group-hover:bg-areia transition-colors">
                {destaque.status === 'no_ar' ? 'Ver as peças da live' : 'Ver as peças'}
              </span>
            </div>
          </Link>
        </section>
      )}

      {outrasProximas.length > 0 && (
        <section className="grid gap-3" aria-labelledby="proximas">
          <h2 id="proximas" className="rotulo !text-[0.66rem] text-caramelo">Próximas lives</h2>
          <ul className="grid gap-3">
            {outrasProximas.map(v => <Cartao key={v.slug} v={v} selo={v.inicioPrevisto ? `Live em ${formatarDataHora(v.inicioPrevisto)}` : 'Live em breve'} />)}
          </ul>
        </section>
      )}

      {publicadas.length > 0 && (
        <section className="grid gap-3" aria-labelledby="vitrines-ativas">
          <h2 id="vitrines-ativas" className="rotulo !text-[0.66rem] text-caramelo">Vitrines</h2>
          <ul className="grid gap-3">
            {publicadas.map(v => <Cartao key={v.slug} v={v} selo={TIPOS_VITRINE[v.tipo]} />)}
          </ul>
        </section>
      )}
    </main>
  );
}

function Cartao({ v, selo }: { v: Item; selo: string }) {
  return (
    <li>
      <Link href={`/vitrine/${encodeURIComponent(v.slug)}`} className="group grid grid-cols-[7.5rem_1fr] sm:grid-cols-[9rem_1fr] bg-card border border-borda rounded-3xl overflow-hidden hover:border-marrom-950 hover:shadow-lg hover:shadow-marrom-950/5 transition-all">
        <div className="relative min-h-[9.5rem]"><Mosaico v={v} /></div>
        <span className="min-w-0 p-4 grid content-center gap-1.5">
          <span className="rotulo !text-[0.6rem] text-suave">{selo}</span>
          <span className="font-semibold text-marrom-950 leading-snug line-clamp-2 text-[1.02rem]">{v.titulo}</span>
          <Detalhes v={v} />
          {v.ofertaAte && <span className="text-xs text-caramelo">Oferta termina em <Contagem ate={v.ofertaAte.toISOString()} fim="instantes" /></span>}
          <span className="text-sm font-semibold text-marrom-950 inline-flex items-center gap-1 mt-0.5">Ver as peças <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span></span>
        </span>
      </Link>
    </li>
  );
}
