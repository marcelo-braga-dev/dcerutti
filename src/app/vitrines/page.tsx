import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { IconeInstagram } from '@/components/ui/icones';
import { Logo } from '@/components/ui/logo';
import { formatarDataHora } from '@/lib/datas';
import { TIPOS_VITRINE, type TipoVitrine } from '@/lib/vitrines';
import { lerConfig } from '@/server/config';
import { vitrinesPublicas } from '@/server/consultas/vitrines';
import { marcaAtual } from '@/server/marca';

export async function generateMetadata(): Promise<Metadata> {
  return { title: { absolute: `Vitrines · ${(await marcaAtual()).nome}` }, robots: { index: false, follow: false } };
}

type Item = { slug: string; tipo: TipoVitrine; titulo: string; pecas: number; imagem: string | null };

function Cartao({ v, selo }: { v: Item; selo?: React.ReactNode }) {
  return (
    <li>
      <Link href={`/vitrine/${encodeURIComponent(v.slug)}`} className="flex items-center gap-4 bg-card border border-borda rounded-3xl p-3 hover:border-marrom-950">
        <span className="relative size-20 shrink-0 rounded-2xl overflow-hidden bg-bege"><Foto src={v.imagem} alt="" sizes="80px" /></span>
        <span className="min-w-0 grid gap-1">
          {selo ?? <span className="rotulo text-suave !text-[0.62rem]">{TIPOS_VITRINE[v.tipo]}</span>}
          <span className="font-semibold text-marrom-950 leading-snug">{v.titulo}</span>
          <span className="text-sm text-suave">{v.pecas} {v.pecas === 1 ? 'peça' : 'peças'}</span>
        </span>
      </Link>
    </li>
  );
}

/** A página do link da bio (docs/26): a live no ar ou a próxima, e as publicações ativas. */
export default async function Vitrines() {
  const cfg = await lerConfig();
  if (!cfg.vitrines.ligadas) notFound();
  const [{ noAr, proximas, publicadas }, marca] = await Promise.all([vitrinesPublicas(), marcaAtual()]);
  const vazio = !noAr && !proximas.length && !publicadas.length;
  return (
    <main className="loja mx-auto max-w-xl px-4 py-8 grid gap-6">
      <div className="grid justify-items-center gap-3 text-center">
        <Logo img={marca.logo} className="h-14 w-auto mix-blend-multiply" prioridade />
        <a href={`https://www.instagram.com/${cfg.instagramLoja}/`} target="_blank" rel="noopener" className={botao('secundario', 'p')}><IconeInstagram className="size-4" /> @{cfg.instagramLoja}</a>
      </div>
      {vazio && <Vazio>Nenhuma vitrine no momento. Acompanhe a loja no Instagram.</Vazio>}
      <ul className="grid gap-3">
        {noAr && <Cartao v={noAr} selo={<span><Etiqueta cor="imperdivel">● Ao vivo agora</Etiqueta></span>} />}
        {proximas.map(v => <Cartao key={v.slug} v={v} selo={<span><Etiqueta cor="caramelo">Live em {v.inicioPrevisto ? formatarDataHora(v.inicioPrevisto) : 'breve'}</Etiqueta></span>} />)}
        {publicadas.map(v => <Cartao key={v.slug} v={v} />)}
      </ul>
    </main>
  );
}
