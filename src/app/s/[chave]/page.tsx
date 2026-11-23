import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { EscolherSugestao } from '@/components/loja/escolher-sugestao';
import { Foto } from '@/components/loja/foto';
import { QuemAtende, SelosConfianca } from '@/components/loja/pedido-publico';
import { Contagem } from '@/components/vitrine/contagem';
import { Logo } from '@/components/ui/logo';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';
import { aberta } from '@/lib/sugestoes';
import { ROBO } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';
import { codigoDaChaveSugestao } from '@/server/link-pedido';
import { marcaAtual } from '@/server/marca';
import { usuarioAtual } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';
import { registrarVista, sugestaoPublica } from '@/server/sugestoes';

type Props = { params: Promise<{ chave: string }> };

const chaveDe = async (params: Props['params']) => decodeURIComponent((await params).chave);
const carregar = async (chave: string) => { const codigo = codigoDaChaveSugestao(chave); return codigo ? sugestaoPublica(codigo) : null; };


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chave = await chaveDe(params);
  const s = await carregar(chave);
  if (!s) return { title: 'Sugestão não encontrada', robots: { index: false, follow: false } };
  const [site, { nome }] = await Promise.all([urlDoSite(), marcaAtual()]);
  const titulo = `${s.nomeVendedor} separou ${s.itens.length} ${s.itens.length === 1 ? 'peça' : 'peças'} para você · ${nome}`;
  const descricao = s.titulo;
  const imagem = { url: `${site}/s/${encodeURIComponent(chave)}/cartao.jpg`, width: 1200, height: 630, type: 'image/jpeg', alt: titulo };
  return {
    title: { absolute: titulo }, description: descricao, robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: nome, locale: 'pt_BR', title: titulo, description: descricao, url: `${site}/s/${chave}`, images: [imagem] },
    twitter: { card: 'summary_large_image', title: titulo, description: descricao, images: [imagem.url] },
  };
}

/**
 * Sugestões para você (D-27): a página que a cliente abre pelo WhatsApp, sem login (a chave assinada autoriza).
 * Mostra só o primeiro nome dela e de quem atende; nada de telefone, endereço ou histórico.
 */
export default async function PaginaSugestao({ params }: Props) {
  const chave = await chaveDe(params);
  const [s, marca, u, h] = await Promise.all([carregar(chave), marcaAtual(), usuarioAtual(), headers()]);
  if (!s) notFound();
  if (u?.papel !== 'vendedor' && u?.papel !== 'gestor' && !ROBO.test(h.get('user-agent') ?? '')) await registrarVista(s.codigo).catch(() => {});
  const contato = linkWhatsApp(s.telefoneContato, `Oi, ${s.nomeVendedor}! É sobre as sugestões ${s.codigo}.`);
  const ofertas = s.itens.some(i => i.preco < i.precoCatalogo);

  const economia = s.itens.reduce((a, i) => a + Math.max(0, Math.max(i.precoCatalogo, i.precoCheio) - i.preco), 0);
  const fotos = s.itens.flatMap(i => i.cores.find(c => c.produtoId === i.corInicial)?.imagem ?? i.cores[0]?.imagem ?? []).filter(Boolean).slice(0, 4) as string[];

  return (
    <main className="loja mx-auto max-w-2xl px-4 sm:px-6 pt-4 sm:pt-8 pb-6 grid gap-6">
      <Logo img={marca.logo} className="h-10 sm:h-12 w-auto justify-self-start mix-blend-multiply" prioridade />

      {/* Topo pessoal (D-36): quem separou, a mensagem dela em balão de conversa e o prazo de verdade. */}
      <header className="rounded-[2rem] bg-marrom-950 text-creme p-5 sm:p-7 grid gap-4 overflow-hidden relative">
        {fotos.length > 0 && (
          <div className="absolute -right-6 -top-6 flex gap-2 rotate-6 opacity-25 pointer-events-none" aria-hidden="true">
            {fotos.map((f, i) => <span key={f + i} className="relative w-20 aspect-[3/4] rounded-xl overflow-hidden bg-bege"><Foto src={f} alt="" sizes="80px" /></span>)}
          </div>
        )}
        <div className="relative flex items-center gap-3">
          <span className="relative size-12 shrink-0 rounded-full bg-caramelo text-creme font-display font-extrabold text-lg grid place-items-center">
            {s.nomeVendedor[0]}<span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-whatsapp ring-2 ring-marrom-950" aria-hidden="true" />
          </span>
          <span className="leading-tight"><span className="block rotulo !text-[0.62rem] text-areia">Sugestões para você</span><span className="block font-semibold">{s.nomeVendedor} · {marca.nome}</span></span>
        </div>
        <h1 className="titulo !text-creme relative text-[1.9rem] sm:text-4xl leading-[1.08]">Oi, {s.nomeCliente}! {s.nomeVendedor} separou {s.itens.length} {s.itens.length === 1 ? 'peça' : 'peças'} para você</h1>
        <div className="relative grid gap-2 justify-items-start">
          <p className="max-w-md rounded-2xl rounded-tl-md bg-creme text-marrom-950 px-4 py-3 shadow-sm">
            <strong className="block">{s.titulo}</strong>
            {s.mensagem && <span className="block whitespace-pre-line text-marrom-900 mt-1">{s.mensagem}</span>}
          </p>
        </div>
        {aberta(s.situacao) && (
          <div className="relative flex flex-wrap gap-2 text-sm">
            <span className="h-8 px-3 rounded-full bg-creme/15 inline-flex items-center gap-1">{ofertas ? 'Preços especiais por mais' : 'Vale por mais'} <strong className="text-creme"><Contagem ate={s.validaAte.toISOString()} fim="pouco tempo" /></strong></span>
            {economia > 0 && <span className="h-8 px-3 rounded-full bg-imperdivel text-white font-semibold inline-flex items-center">Até {brl(economia)} de economia</span>}
          </div>
        )}
      </header>

      {aberta(s.situacao) && (
        <div className="grid gap-3">
          <p className="text-sm text-suave">
            Marque <strong className="text-oliva">♥ Quero</strong> no que gostou, escolha cor e tamanho e toque em <strong className="text-marrom-950">Quero comprar</strong> ou <strong className="text-marrom-950">Quero provar em casa</strong>. Suas marcações ficam salvas neste link.
          </p>
          {s.cupom && <p className="text-sm bg-oliva/10 border border-oliva/40 rounded-2xl px-4 py-3">Cupom <strong className="font-display tracking-wide">{s.cupom}</strong> já vai aplicado no seu pedido.</p>}
        </div>
      )}

      {aberta(s.situacao) ? <EscolherSugestao chave={chave} s={s} /> : (
        <div className="bg-card border border-borda rounded-[2rem] p-6 sm:p-8 grid gap-4 text-center justify-items-center">
          <span className={`size-14 rounded-full grid place-items-center text-2xl ${s.situacao === 'convertida' ? 'bg-oliva text-creme' : 'bg-bege text-caramelo'}`} aria-hidden="true">{s.situacao === 'convertida' ? '✓' : '⏳'}</span>
          <h2 className="titulo text-xl">{s.situacao === 'convertida' ? 'Você já respondeu estas sugestões 💛' : s.situacao === 'vencida' ? 'Estas sugestões venceram' : 'Estas sugestões não estão mais disponíveis'}</h2>
          <p className="text-suave max-w-sm">{s.situacao === 'convertida' ? `${s.nomeVendedor} recebeu o seu pedido e vai falar com você pelo WhatsApp.` : `Fale com ${s.nomeVendedor}: ela separa novas peças para você.`}</p>
          <a href={contato} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Falar com {s.nomeVendedor}</a>
          {fotos.length > 0 && (
            <ul className="mt-2 grid grid-cols-4 gap-2 w-full max-w-sm" aria-label="Peças desta sugestão">
              {fotos.map((f, i) => <li key={f + i} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-bege"><Foto src={f} alt="" sizes="80px" className={s.situacao === 'convertida' ? '' : 'grayscale'} /></li>)}
            </ul>
          )}
        </div>
      )}

      {aberta(s.situacao) && (
        <div className="bg-card border border-borda rounded-3xl p-4 sm:p-5 grid gap-3 mb-40">
          <QuemAtende nome={s.nomeVendedor} link={contato} />
          <SelosConfianca />
        </div>
      )}
    </main>
  );
}
