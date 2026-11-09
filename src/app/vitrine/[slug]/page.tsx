import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { EscolherVitrine } from '@/components/loja/escolher-vitrine';
import { Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { Logo } from '@/components/ui/logo';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { ROBO, vitrineAtiva } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';
import { vitrinePublica, vitrinesLigadas } from '@/server/consultas/vitrines';
import { marcaAtual } from '@/server/marca';
import { EQUIPE, usuarioAtual } from '@/server/permissoes';
import { registrarVisita } from '@/server/vitrines';

type Props = { params: Promise<{ slug: string }> };

const slugDe = async (params: Props['params']) => decodeURIComponent((await params).slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await vitrinePublica(await slugDe(params));
  const { nome } = await marcaAtual();
  return { title: { absolute: v ? `${v.titulo} · ${nome}` : nome }, robots: { index: false, follow: false }, ...(v?.descricao ? { description: v.descricao.slice(0, 160) } : {}) };
}

/** Vitrine pública (docs/26, D-32): só as peças escolhidas, sem login. O resto do catálogo continua privado (D-09). */
export default async function PaginaVitrine({ params }: Props) {
  if (!(await vitrinesLigadas())) notFound();
  const slug = await slugDe(params);
  const [u, marca, h] = await Promise.all([usuarioAtual(), marcaAtual(), headers()]);
  const equipe = !!u && EQUIPE.includes(u.papel);
  const v = await vitrinePublica(slug, equipe);
  if (!v) notFound();
  if (!equipe && !ROBO.test(h.get('user-agent') ?? '') && v.status !== 'rascunho') await registrarVisita(v.id);
  const aberta = vitrineAtiva(v.status);

  return (
    <main className="loja mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 grid gap-6">
      <Link href="/vitrines" aria-label="Todas as vitrines" className="justify-self-start"><Logo img={marca.logo} className="h-12 w-auto mix-blend-multiply" prioridade /></Link>
      {v.status === 'rascunho' && <p className="text-sm bg-bege text-caramelo px-4 py-2">Rascunho: só a equipe vê esta página.</p>}
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {v.status === 'no_ar' && <Etiqueta cor="imperdivel">● Ao vivo agora</Etiqueta>}
          {v.status === 'agendada' && v.inicioPrevisto && <Etiqueta cor="caramelo">Live em {formatarDataHora(v.inicioPrevisto)}</Etiqueta>}
          {v.status === 'encerrada' && <Etiqueta cor="cinza">Encerrada</Etiqueta>}
        </div>
        <h1 className="titulo text-3xl sm:text-4xl leading-tight">{v.titulo}</h1>
        {v.descricao && <p className="text-suave whitespace-pre-line max-w-2xl">{v.descricao}</p>}
        {v.ofertaAte && <p className="text-sm font-semibold text-caramelo">Preços especiais até {formatarData(v.ofertaAte)}</p>}
        {v.urlInstagram && (
          <a href={v.urlInstagram} target="_blank" rel="noopener" className={botao('secundario', 'm', 'justify-self-start mt-1')}>{v.status === 'no_ar' ? 'Assistir no Instagram' : 'Ver no Instagram'}</a>
        )}
      </header>
      {!aberta && (
        <div className="bg-card border border-borda rounded-3xl p-5 grid gap-3 justify-items-start">
          <p>Esta vitrine terminou, mas podemos ver as peças com você.</p>
          <a href={linkWhatsApp(v.contato.telefone, `Oi! Vi "${v.titulo}" e queria saber das peças.`)} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Falar com {v.contato.nome ?? 'a loja'}</a>
        </div>
      )}
      <EscolherVitrine slug={v.slug} pecas={v.pecas} aberta={aberta && v.status !== 'rascunho'} />
    </main>
  );
}
