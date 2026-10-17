import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { Etiqueta } from '@/components/ui/basicos';
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
  const [p, { nome }] = await Promise.all([carregar((await params).chave), marcaAtual()]);
  if (!p) notFound();
  const condicional = p.tipo === 'condicional';

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-8 py-8 sm:py-12 grid gap-6">
      <Link href="/" className="font-[Georgia,serif] italic text-3xl text-marrom-950 justify-self-start">{nome}</Link>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta cor="escuro">{condicional ? 'Condicional' : 'Pedido'}</Etiqueta>
          {p.status === 'confirmado' && <Etiqueta cor="oliva">Confirmado</Etiqueta>}
          {p.status === 'cancelado' && <Etiqueta cor="cinza">Cancelado</Etiqueta>}
        </div>
        <h1 className="titulo text-3xl">{p.codigo}</h1>
        <p className="text-suave">{p.pecas} {p.pecas === 1 ? 'peça' : 'peças'} · feito em {formatarDataHora(p.criadoEm)}</p>
      </header>

      <ul className="grid sm:grid-cols-2 gap-4">
        {p.itens.map(i => (
          <li key={i.id} className={`bg-card border border-borda ${i.situacao === 'devolvido' ? 'opacity-50' : ''}`}>
            <div className="relative aspect-[3/4] bg-bege"><Foto src={i.imagem} alt={i.nome} sizes="(min-width: 640px) 320px, 100vw" /></div>
            <div className="p-4 grid gap-1">
              <div className="rotulo !text-[0.62rem] text-suave">{i.marca}</div>
              <div className="text-marrom-950 leading-snug">{i.nome}</div>
              <div className="text-sm text-suave">
                Tam. <strong className="text-marrom-950">{i.tamanho}</strong>{i.cor ? ` · ${i.cor}` : ''} · Ref. {i.referencia}{i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''}
              </div>
              <div className="flex justify-between items-baseline mt-1">
                <span className="text-sm text-suave">{i.quantidade} × {brl(i.preco)}</span>
                <span className="font-display font-extrabold">{brl(i.preco * i.quantidade)}</span>
              </div>
              {i.situacao === 'devolvido' && <span className="text-sm text-suave">Devolvida</span>}
            </div>
          </li>
        ))}
      </ul>

      <section className="bg-card border border-borda p-5 grid gap-2 text-sm">
        <div className="flex justify-between"><span>Peças</span><span>{brl(p.subtotal)}</span></div>
        {p.cupom && p.desconto > 0 && <div className="flex justify-between text-oliva"><span>Cupom {p.cupom}</span><span>−{brl(p.desconto)}</span></div>}
        {!condicional && <div className="flex justify-between"><span>Frete</span><span>{p.frete == null ? 'A combinar' : p.frete === 0 ? `Grátis${p.freteCupom && p.cupom ? ` (cupom ${p.cupom})` : ''}` : brl(p.frete)}</span></div>}
        <div className="flex justify-between border-t border-borda pt-3 mt-1 font-display font-extrabold text-lg">
          <span>{condicional ? 'Valor das peças' : 'Total'}</span>
          <span>{brl(p.total)}{!condicional && p.frete == null && <span className="text-sm font-normal"> + frete</span>}</span>
        </div>
        <p className="text-suave">{condicional ? 'Condicional: a cliente prova em casa e paga só o que ficar.' : 'Pagamento e entrega combinados pelo WhatsApp.'}</p>
      </section>

      <p className="text-sm text-suave">
        É da equipe da loja? <Link href={`/painel/pedidos?q=${encodeURIComponent(p.codigo)}`} className="underline underline-offset-4 text-marrom-950">Abrir no painel</Link>
      </p>
    </main>
  );
}
