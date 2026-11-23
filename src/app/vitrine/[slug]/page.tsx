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
import { ROBO, vitrineAtiva } from '@/lib/vitrines';
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
  // Prova social só verdadeira e só quando já diz algo (a partir de 3 pedidos).
  const provaSocial = aberta && v.pedidosRecebidos >= 3;

  return (
    <main className="loja mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-8 pb-10 grid gap-6 sm:gap-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/vitrines" aria-label="Todas as vitrines"><Logo img={marca.logo} className="h-10 sm:h-12 w-auto mix-blend-multiply" prioridade /></Link>
        <Compartilhar titulo={v.titulo} className="h-10 px-4 rounded-full border border-borda-forte bg-card text-sm font-semibold text-marrom-950 inline-flex items-center gap-2 hover:border-marrom-950" />
      </div>

      {v.status === 'rascunho' && <p className="text-sm bg-bege text-caramelo px-4 py-2 rounded-xl">Rascunho: só a equipe vê esta página.</p>}

      {/* Topo (D-36): compacto no celular, com o título sobre as fotos, para as peças aparecerem logo. */}
      <header className="relative overflow-hidden rounded-[2rem] bg-marrom-950 text-creme md:grid md:grid-cols-[1.1fr_1fr]">
        {fotos.length > 0 && (
          <div className={`absolute inset-0 md:relative md:order-last md:min-h-[24rem] grid gap-0.5 ${fotos.length >= 3 ? 'grid-cols-[1.4fr_1fr] grid-rows-2' : fotos.length === 2 ? 'grid-cols-2' : ''}`}>
            {fotos.map((f, i) => (
              <div key={f + i} className={`relative overflow-hidden ${fotos.length >= 3 && i === 0 ? 'row-span-2' : ''}`}>
                <Foto src={f} alt="" sizes="(min-width: 768px) 30vw, 70vw" prioridade={i === 0} className={aberta ? '' : 'grayscale'} />
              </div>
            ))}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-marrom-950 via-marrom-950/75 to-marrom-950/20 md:bg-gradient-to-r md:from-marrom-950/50 md:via-transparent md:to-transparent" />
          </div>
        )}
        <div className={`relative p-5 sm:p-9 grid content-end md:content-center gap-3 sm:gap-4 ${fotos.length ? 'min-h-[22rem] sm:min-h-[26rem] md:min-h-0' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            {aoVivo && (
              <span className="h-7 pl-2.5 pr-3 rounded-full bg-imperdivel text-white text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2">
                <span className="relative flex size-2"><span className="absolute inset-0 rounded-full bg-white animate-ping motion-reduce:animate-none" /><span className="relative size-2 rounded-full bg-white" /></span>
                Ao vivo agora
              </span>
            )}
            {v.status === 'agendada' && v.inicioPrevisto && (
              <span className="h-7 px-3 rounded-full bg-card text-marrom-950 text-xs font-bold inline-flex items-center gap-1">Live em <Contagem ate={v.inicioPrevisto.toISOString()} fim="instantes" /></span>
            )}
            {v.status === 'encerrada' && <span className="h-7 px-3 rounded-full bg-creme/15 text-xs font-semibold inline-flex items-center">Encerrada</span>}
            {aberta && descontoMax > 0 && <span className="h-7 px-3 rounded-full bg-imperdivel text-white text-xs font-bold inline-flex items-center">Até {descontoMax}% off</span>}
            <span className="h-7 px-3 rounded-full bg-creme/15 backdrop-blur text-xs font-semibold inline-flex items-center">{v.pecas.length} {v.pecas.length === 1 ? 'peça' : 'peças'}</span>
          </div>
          <h1 className="titulo !text-creme text-[2rem] sm:text-5xl leading-[1.05] drop-shadow-sm">{v.titulo}</h1>
          {v.descricao && <p className="text-areia max-w-xl leading-relaxed line-clamp-3 md:line-clamp-none whitespace-pre-line">{v.descricao}</p>}
          {v.status === 'agendada' && v.inicioPrevisto && <p className="text-sm text-areia">Live em {formatarDataHora(v.inicioPrevisto)}. As peças já estão aqui.</p>}
          {v.ofertaAte && aberta && (
            <p className="text-sm text-areia">Preços especiais terminam em <strong className="text-creme"><Contagem ate={v.ofertaAte.toISOString()} fim="instantes" /></strong></p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {v.urlInstagram && (
              <a href={v.urlInstagram} target="_blank" rel="noopener"
                className="h-10 px-4 rounded-full bg-creme text-marrom-950 text-sm font-semibold inline-flex items-center gap-2 hover:bg-areia transition-colors">
                <IconeInstagram className="size-4" />{aoVivo ? 'Assistir no Instagram' : 'Ver no Instagram'}
              </a>
            )}
            {provaSocial && <span className="text-sm text-areia">🔥 {v.pedidosRecebidos} pedidos nesta vitrine</span>}
          </div>
        </div>
      </header>

      {aberta && (
        // Confiança (D-36): quem atende, de pessoa para pessoa, e as regras sem letra miúda.
        <div className="grid sm:grid-cols-[auto_1fr] gap-3 sm:gap-6 items-center bg-card border border-borda rounded-3xl p-4 sm:px-6">
          <a href={falar} target="_blank" rel="noopener" className="flex items-center gap-3 group">
            <span className="relative size-11 shrink-0 rounded-full bg-caramelo text-creme font-display font-extrabold grid place-items-center">
              {(v.contato.nome ?? 'L')[0]}
              <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-whatsapp ring-2 ring-card" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs text-suave">Quem te atende</span>
              <span className="block font-semibold text-marrom-950 group-hover:underline underline-offset-4">{v.contato.nome ?? 'Equipe da loja'} · WhatsApp</span>
            </span>
          </a>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-suave sm:justify-end">
            {['Sem cadastro', 'Pedido pelo WhatsApp', 'Reserva confirmada pela loja'].map(t => (
              <li key={t} className="flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="size-4 text-oliva" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{t}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      <EscolherVitrine slug={v.slug} pecas={v.pecas} aberta={aberta && v.status !== 'rascunho'} vendedora={v.contato.nome} />

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
