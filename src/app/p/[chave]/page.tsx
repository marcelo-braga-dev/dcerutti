import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Separacao } from '@/components/pedido/separacao';
import { Logo } from '@/components/ui/logo';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { pedidoPublico } from '@/server/consultas/pedido-publico';
import { codigoDaChave } from '@/server/link-pedido';
import { urlDoSite } from '@/server/site';
import { marcaAtual } from '@/server/marca';

type Props = { params: Promise<{ chave: string }> };

async function carregar(chave: string) {
  const codigo = codigoDaChave(decodeURIComponent(chave));
  return codigo ? pedidoPublico(codigo) : null;
}

/**
 * Página pública do pedido (D-20): o link que vai na mensagem do WhatsApp. A prévia do link (Open Graph) mostra o
 * cartão com as fotos; ao tocar, o vendedor vê as peças em tamanho grande. Sem dados pessoais da cliente.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chave } = await params;
  const p = await carregar(chave);
  if (!p) return { title: 'Pedido não encontrado', robots: { index: false, follow: false } };
  const [site, { nome }] = await Promise.all([urlDoSite(), marcaAtual()]);
  const titulo = `${p.tipo === 'condicional' ? 'Condicional' : 'Pedido'} ${p.codigo} · ${nome}`;
  const descricao = `${p.pecas} ${p.pecas === 1 ? 'peça' : 'peças'} · ${brl(p.total)}${p.tipo === 'compra' && p.frete == null ? ' + frete' : ''}`;
  const imagem = { url: `${site}/p/${encodeURIComponent(chave)}/cartao.jpg`, width: 1200, height: 630, type: 'image/jpeg', alt: titulo };
  return {
    title: { absolute: titulo },
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: nome, locale: 'pt_BR', title: titulo, description: descricao, url: `${site}/p/${chave}`, images: [imagem] },
    twitter: { card: 'summary_large_image', title: titulo, description: descricao, images: [imagem.url] },
  };
}

export default async function PedidoPublico({ params }: Props) {
  const [p, marca] = await Promise.all([carregar((await params).chave), marcaAtual()]);
  if (!p) notFound();
  const condicional = p.tipo === 'condicional';

  return (
    <main className="loja mx-auto max-w-3xl px-4 sm:px-8 pt-4 sm:pt-8 pb-10 grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" aria-label={marca.nome}><Logo img={marca.logo} className="h-10 sm:h-12 w-auto mix-blend-multiply" prioridade /></Link>
        <Link href={`/painel/pedidos?q=${encodeURIComponent(p.codigo)}`} className="h-10 px-4 rounded-full bg-marrom-950 text-creme text-sm font-semibold inline-flex items-center hover:bg-marrom-700">Abrir no painel</Link>
      </div>

      <header className="rounded-[2rem] bg-marrom-950 text-creme p-5 sm:p-7 grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-7 px-3 rounded-full bg-creme/15 text-xs font-bold uppercase tracking-wide inline-flex items-center">{condicional ? 'Condicional' : 'Pedido'}</span>
          {p.status === 'pendente' && <span className="h-7 px-3 rounded-full bg-caramelo text-xs font-bold inline-flex items-center">Em aberto</span>}
          {p.status === 'confirmado' && <span className="h-7 px-3 rounded-full bg-oliva text-xs font-bold inline-flex items-center">Confirmado</span>}
          {p.status === 'cancelado' && <span className="h-7 px-3 rounded-full bg-creme/15 text-xs font-bold inline-flex items-center">Cancelado</span>}
        </div>
        <h1 className="titulo !text-creme text-4xl sm:text-5xl">{p.codigo}</h1>
        <p className="text-areia">{p.pecas} {p.pecas === 1 ? 'peça' : 'peças'} · {brl(p.total)}{!condicional && p.frete == null ? ' + frete' : ''} · feito em {formatarDataHora(p.criadoEm)}</p>
      </header>

      <Separacao codigo={p.codigo} separavel={p.status !== 'cancelado'}
        itens={p.itens.map(i => ({ id: i.id, nome: i.nome, marca: i.marca, referencia: i.referencia, cor: i.cor, tamanho: i.tamanho, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: i.preco, imagem: i.imagem, situacao: i.situacao }))} />

      <section className="bg-card border border-borda rounded-3xl p-5 sm:p-6 grid gap-2 text-sm">
        <div className="flex justify-between"><span>Peças</span><span>{brl(p.subtotal)}</span></div>
        {p.cupom && p.desconto > 0 && <div className="flex justify-between text-oliva"><span>Cupom {p.cupom}</span><span>−{brl(p.desconto)}</span></div>}
        {!condicional && <div className="flex justify-between"><span>Frete</span><span>{p.frete == null ? 'A combinar' : p.frete === 0 ? `Grátis${p.freteCupom && p.cupom ? ` (cupom ${p.cupom})` : ''}` : brl(p.frete)}</span></div>}
        <div className="flex justify-between border-t border-borda pt-3 mt-1 font-extrabold text-lg">
          <span>{condicional ? 'Valor das peças' : 'Total'}</span>
          <span>{brl(p.total)}{!condicional && p.frete == null && <span className="text-sm font-normal"> + frete</span>}</span>
        </div>
        <p className="text-suave">{condicional ? 'Condicional: a cliente prova em casa e paga só o que ficar.' : 'Pagamento e entrega combinados pelo WhatsApp.'}</p>
      </section>

    </main>
  );
}
