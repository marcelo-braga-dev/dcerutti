import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { EscolherSugestao } from '@/components/loja/escolher-sugestao';
import { Logo } from '@/components/ui/logo';
import { botao } from '@/components/ui/botao';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { aberta } from '@/lib/sugestoes';
import { linkWhatsApp } from '@/lib/whatsapp';
import { codigoDaChaveSugestao } from '@/server/link-pedido';
import { marcaAtual } from '@/server/marca';
import { usuarioAtual } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';
import { registrarVista, sugestaoPublica } from '@/server/sugestoes';

type Props = { params: Promise<{ chave: string }> };

const chaveDe = async (params: Props['params']) => decodeURIComponent((await params).chave);
const carregar = async (chave: string) => { const codigo = codigoDaChaveSugestao(chave); return codigo ? sugestaoPublica(codigo) : null; };

/** Robôs que buscam a prévia do link (WhatsApp, Facebook, buscadores): não contam como "vista". */
const ROBO = /whatsapp|facebookexternalhit|facebot|bot|crawler|spider|preview|curl|wget/i;

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

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10 grid gap-6">
      <Logo img={marca.logo} className="h-12 w-auto justify-self-start mix-blend-multiply" prioridade />
      <header className="grid gap-2">
        <span className="rotulo text-caramelo">Sugestões para você</span>
        <h1 className="titulo text-2xl sm:text-3xl leading-tight">Oi, {s.nomeCliente}! {s.nomeVendedor} separou {s.itens.length} {s.itens.length === 1 ? 'peça' : 'peças'} para você</h1>
        <p className="text-lg text-marrom-950">{s.titulo}</p>
        {s.mensagem && <p className="text-suave whitespace-pre-line">{s.mensagem}</p>}
        {aberta(s.situacao) && (
          <p className="text-sm text-suave">
            Marque <strong className="text-oliva">Quero</strong> no que gostou, escolha cor e tamanho e toque em <strong>Quero comprar</strong> ou <strong>Quero provar em casa</strong>.
            {ofertas ? <> Preços especiais até <strong className="text-imperdivel">{formatarDataHora(s.validaAte)}</strong>.</> : <> Vale até {formatarDataHora(s.validaAte)}.</>}
          </p>
        )}
        {aberta(s.situacao) && s.cupom && (
          <p className="text-sm bg-oliva/10 border border-oliva/40 px-3 py-2">Cupom <strong className="font-display tracking-wide">{s.cupom}</strong> já vai aplicado no seu pedido.</p>
        )}
      </header>

      {aberta(s.situacao) ? <EscolherSugestao chave={chave} s={s} /> : (
        <div className="bg-card border border-borda p-6 grid gap-3 text-center justify-items-center">
          <h2 className="titulo text-xl">{s.situacao === 'convertida' ? 'Você já respondeu estas sugestões 💛' : s.situacao === 'vencida' ? 'Estas sugestões venceram' : 'Estas sugestões não estão mais disponíveis'}</h2>
          <p className="text-suave max-w-sm">{s.situacao === 'convertida' ? `${s.nomeVendedor} recebeu o seu pedido e vai falar com você pelo WhatsApp.` : `Fale com ${s.nomeVendedor} para receber novas sugestões.`}</p>
          <a href={contato} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Falar com {s.nomeVendedor}</a>
          <ul className="mt-4 grid grid-cols-3 gap-2 w-full">
            {s.itens.slice(0, 6).map(i => <li key={i.id} className="text-xs text-suave truncate">{i.nome} · {brl(i.preco)}</li>)}
          </ul>
        </div>
      )}
    </main>
  );
}
