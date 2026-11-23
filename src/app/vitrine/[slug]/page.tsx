import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { EscolherVitrine } from '@/components/loja/escolher-vitrine';
import { Foto } from '@/components/loja/foto';
import { Logo } from '@/components/ui/logo';
import { IconeInstagram } from '@/components/ui/icones';
import { Compartilhar } from '@/components/vitrine/compartilhar';
import { Contagem } from '@/components/vitrine/contagem';
import { formatarDataHora } from '@/lib/datas';
import { ROBO, TIPOS_VITRINE, vitrineAtiva } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';
import { vitrinePublica, vitrinesLigadas } from '@/server/consultas/vitrines';
import { marcaAtual } from '@/server/marca';
import { EQUIPE, usuarioAtual } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';
import { registrarVisita } from '@/server/vitrines';

type Props = { params: Promise<{ slug: string }> };

const slugDe = async (params: Props['params']) => decodeURIComponent((await params).slug);

/** Prévia do link (WhatsApp, Instagram, Direct): título, texto e a foto da primeira peça. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await vitrinePublica(await slugDe(params));
  const [{ nome }, site] = await Promise.all([marcaAtual(), urlDoSite()]);
  if (!v) return { title: { absolute: nome }, robots: { index: false, follow: false } };
  const titulo = `${v.titulo} · ${nome}`;
  const descricao = v.descricao?.slice(0, 160) || `${v.pecas.length} ${v.pecas.length === 1 ? 'peça' : 'peças'} para escolher o tamanho e pedir pelo WhatsApp.`;
  const foto = v.pecas.find(p => p.imagem)?.imagem;
  const imagem = foto ? (foto.startsWith('http') ? foto : `${site}${foto}`) : undefined;
  return {
    title: { absolute: titulo }, description: descricao, robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: nome, locale: 'pt_BR', title: titulo, description: descricao, url: `${site}/vitrine/${v.slug}`, ...(imagem ? { images: [{ url: imagem, alt: v.titulo }] } : {}) },
  };
}

/**
 * Vitrine pública (docs/26, D-32, D-36): só as peças escolhidas, sem login. O resto do catálogo continua privado (D-09).
 * Feita para o navegador do Instagram no celular: topo com as fotos e a situação, filtro de tamanho, grade de 2 colunas
 * e a barra fixa do pedido.
 */
export default async function PaginaVitrine({ params }: Props) {
  if (!(await vitrinesLigadas())) notFound();
  const slug = await slugDe(params);
  const [u, marca, h] = await Promise.all([usuarioAtual(), marcaAtual(), headers()]);
  const equipe = !!u && EQUIPE.includes(u.papel);
  const v = await vitrinePublica(slug, equipe);
  if (!v) notFound();
  if (!equipe && !ROBO.test(h.get('user-agent') ?? '') && v.status !== 'rascunho') await registrarVisita(v.id);
  const aberta = vitrineAtiva(v.status);
  const fotos = v.pecas.flatMap(p => (p.imagem ? [p.imagem] : [])).slice(0, 3);
  const descontoMax = v.pecas.reduce((m, p) => Math.max(m, p.desconto), 0);
  const aoVivo = v.status === 'no_ar';
  const falar = linkWhatsApp(v.contato.telefone, `Oi! Vi a vitrine "${v.titulo}" e queria tirar uma dúvida.`);

  return (
    <main className="loja mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-8 pb-10 grid gap-6 sm:gap-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/vitrines" aria-label="Todas as vitrines"><Logo img={marca.logo} className="h-10 sm:h-12 w-auto mix-blend-multiply" prioridade /></Link>
        <Compartilhar titulo={v.titulo} className="h-10 px-4 rounded-full border border-borda-forte bg-card text-sm font-semibold text-marrom-950 inline-flex items-center gap-2 hover:border-marrom-950" />
      </div>

      {v.status === 'rascunho' && <p className="text-sm bg-bege text-caramelo px-4 py-2 rounded-xl">Rascunho: só a equipe vê esta página.</p>}

      <header className="relative overflow-hidden rounded-[2rem] bg-marrom-950 text-creme grid md:grid-cols-[1.15fr_1fr]">
        {fotos.length > 0 && (
          <div className={`relative order-first md:order-last h-56 sm:h-72 md:h-auto md:min-h-[22rem] grid gap-1 ${fotos.length >= 3 ? 'grid-cols-[1.4fr_1fr] grid-rows-2' : fotos.length === 2 ? 'grid-cols-2' : ''}`}>
            {fotos.map((f, i) => (
              <div key={f + i} className={`relative overflow-hidden ${fotos.length >= 3 && i === 0 ? 'row-span-2' : ''}`}>
                <Foto src={f} alt="" sizes="(min-width: 768px) 30vw, 60vw" prioridade={i === 0} className={aberta ? '' : 'grayscale'} />
              </div>
            ))}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-marrom-950/70 to-transparent md:bg-gradient-to-r md:from-marrom-950/60" />
          </div>
        )}
        <div className="relative p-6 sm:p-9 grid content-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {aoVivo && (
              <span className="h-7 pl-2.5 pr-3 rounded-full bg-imperdivel text-white text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2">
                <span className="relative flex size-2"><span className="absolute inset-0 rounded-full bg-white animate-ping motion-reduce:animate-none" /><span className="relative size-2 rounded-full bg-white" /></span>
                Ao vivo agora
              </span>
            )}
            {v.status === 'agendada' && v.inicioPrevisto && (
              <span className="h-7 px-3 rounded-full bg-creme/15 text-xs font-semibold inline-flex items-center gap-1.5">Live em {formatarDataHora(v.inicioPrevisto)}</span>
            )}
            {v.status === 'encerrada' && <span className="h-7 px-3 rounded-full bg-creme/15 text-xs font-semibold inline-flex items-center">Encerrada</span>}
            {!aoVivo && v.status !== 'agendada' && v.status !== 'encerrada' && <span className="rotulo !text-[0.65rem] text-areia">{TIPOS_VITRINE[v.tipo]}</span>}
          </div>
          <h1 className="titulo !text-creme text-[2.1rem] sm:text-5xl leading-[1.05]">{v.titulo}</h1>
          {v.descricao && <p className="text-areia whitespace-pre-line max-w-xl leading-relaxed">{v.descricao}</p>}
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Sobre esta vitrine">
            <li className="h-8 px-3 rounded-full border border-creme/20 inline-flex items-center">{v.pecas.length} {v.pecas.length === 1 ? 'peça' : 'peças'}</li>
            {aberta && descontoMax > 0 && <li className="h-8 px-3 rounded-full bg-imperdivel/90 text-white font-semibold inline-flex items-center">Até {descontoMax}% off</li>}
            {v.status === 'agendada' && v.inicioPrevisto && <li className="h-8 px-3 rounded-full border border-creme/20 inline-flex items-center gap-1">Começa em <Contagem ate={v.inicioPrevisto.toISOString()} fim="instantes" /></li>}
          </ul>
          {v.ofertaAte && aberta && (
            <p className="text-sm text-areia">Preços especiais terminam em <strong className="text-creme"><Contagem ate={v.ofertaAte.toISOString()} fim="instantes" /></strong></p>
          )}
          {v.urlInstagram && (
            <a href={v.urlInstagram} target="_blank" rel="noopener"
              className="justify-self-start h-11 px-5 rounded-full bg-creme text-marrom-950 text-sm font-semibold inline-flex items-center gap-2 hover:bg-areia transition-colors">
              <IconeInstagram className="size-4" />{aoVivo ? 'Assistir no Instagram' : 'Ver no Instagram'}
            </a>
          )}
        </div>
      </header>

      {!aberta && v.status !== 'rascunho' && (
        <div className="bg-card border border-borda rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="titulo text-xl">Esta vitrine terminou</h2>
            <p className="text-suave text-sm">Ainda dá para ver as peças com você: fale com a gente e conferimos os tamanhos.</p>
          </div>
          <a href={linkWhatsApp(v.contato.telefone, `Oi! Vi "${v.titulo}" e queria saber das peças.`)} target="_blank" rel="noopener"
            className="h-11 px-5 rounded-full bg-whatsapp text-white text-sm font-semibold inline-flex items-center hover:bg-whatsapp-escuro">Falar com {v.contato.nome ?? 'a loja'}</a>
        </div>
      )}

      <EscolherVitrine slug={v.slug} pecas={v.pecas} aberta={aberta && v.status !== 'rascunho'} />

      {aberta && (
        <footer className="grid sm:grid-cols-3 gap-3 text-sm">
          {[
            ['1', 'Escolha o tamanho', 'Toque no tamanho de cada peça que quiser.'],
            ['2', 'Envie pelo WhatsApp', `A conversa com ${v.contato.nome ?? 'a loja'} abre com a sua lista pronta.`],
            ['3', 'A loja confirma', 'Separamos as peças e combinamos frete e pagamento.'],
          ].map(([n, t, d]) => (
            <div key={n} className="bg-card border border-borda rounded-2xl p-4 flex gap-3">
              <span className="size-8 shrink-0 rounded-full bg-bege text-caramelo font-display font-extrabold grid place-items-center">{n}</span>
              <div><div className="font-semibold text-marrom-950">{t}</div><div className="text-suave">{d}</div></div>
            </div>
          ))}
          <p className="sm:col-span-3 text-center text-suave">Dúvida? <a href={falar} target="_blank" rel="noopener" className="underline underline-offset-4 text-marrom-950">Fale com {v.contato.nome ?? 'a loja'} no WhatsApp</a> · <Link href="/vitrines" className="underline underline-offset-4 text-marrom-950">Mais vitrines</Link></p>
        </footer>
      )}
    </main>
  );
}
