import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import QRCode from 'qrcode';
import { Foto } from '@/components/loja/foto';
import { Pagar } from '@/components/pagamento/pagar';
import { Alerta } from '@/components/ui/basicos';
import { brl } from '@/lib/dinheiro';
import { descreverMeio } from '@/lib/pagamento';
import { formatarDataHora } from '@/lib/datas';
import { pedidoParaPagar } from '@/server/consultas/pagamentos';
import { codigoDaChavePagamento } from '@/server/link-pedido';
import { marcaAtual } from '@/server/marca';
import { talvezConciliar } from '@/server/pagamentos/cobrancas';

type Props = { params: Promise<{ chave: string }>; searchParams: Promise<{ r?: string }> };

export const metadata: Metadata = { title: 'Pagamento do pedido', robots: { index: false, follow: false } };

const AVISO_RETORNO: Record<string, string> = {
  falha: 'O pagamento não foi aprovado. Você pode tentar de novo com outro cartão ou pagar com Pix.',
  pendente: 'O Mercado Pago ainda está analisando o pagamento. Assim que for aprovado, a loja fica sabendo.',
};

/**
 * Link de pagamento (docs/27): a vendedora manda no WhatsApp e a cliente paga sem entrar na conta. A chave assinada
 * libera só esta página; aparecem o primeiro nome, as peças e os valores, nunca telefone, endereço ou CPF.
 */
export default async function PaginaPagar({ params, searchParams }: Props) {
  const [{ chave: bruta }, { r }] = await Promise.all([params, searchParams]);
  const chave = decodeURIComponent(bruta);
  const codigo = codigoDaChavePagamento(chave);
  if (!codigo) notFound();
  const [p, { nome }] = await Promise.all([pedidoParaPagar(codigo), marcaAtual()]);
  if (!p) notFound();
  after(() => talvezConciliar());

  const pixAtivo = p.pixAtivo?.pixCopiaECola
    ? { copiaECola: p.pixAtivo.pixCopiaECola, expiraEm: p.pixAtivo.expiraEm?.toISOString() ?? null, qrSvg: await QRCode.toString(p.pixAtivo.pixCopiaECola, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }
    : null;
  const subtotal = Math.round(p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0) * 100) / 100;
  const recusada = p.ultima?.status === 'recusada' && !p.pago;
  const aviso = r && AVISO_RETORNO[r] && !p.pago ? AVISO_RETORNO[r] : recusada ? AVISO_RETORNO.falha : null;

  return (
    <main className="loja mx-auto max-w-xl px-4 sm:px-8 py-8 sm:py-12 grid gap-6">
      <Link href="/" className="titulo italic text-3xl justify-self-start">{nome}</Link>
      <header className="grid gap-1">
        <div className="rotulo text-suave">{p.tipo === 'condicional' ? 'Condicional' : 'Pedido'} {p.codigo}</div>
        <h1 className="titulo text-4xl">{p.pago ? 'Pagamento aprovado' : `Olá${p.primeiroNome ? `, ${p.primeiroNome}` : ''}!`}</h1>
      </header>

      {p.pago ? (
        <section className="bg-card border border-oliva rounded-3xl p-6 grid gap-2">
          <p className="text-lg">Recebemos <strong>{brl(p.pago.valor)}</strong> ({descreverMeio(p.pago)}){p.pago.aprovadaEm ? ` em ${formatarDataHora(p.pago.aprovadaEm)}` : ''}. ✓</p>
          <p className="text-suave">A loja já foi avisada e combina a entrega com você pelo WhatsApp. Obrigada!</p>
          {p.pago.status === 'estornada_parcial' && <p className="text-sm text-suave">Parte do valor ({brl(p.pago.valorEstornado)}) foi devolvida.</p>}
        </section>
      ) : p.estornado ? (
        <Alerta tipo="aviso">O pagamento deste pedido foi devolvido. Fale com a loja pelo WhatsApp.</Alerta>
      ) : p.pagoManual ? (
        <Alerta tipo="ok">Este pedido já consta como pago. Qualquer dúvida, fale com a loja pelo WhatsApp.</Alerta>
      ) : !p.ligado ? (
        <Alerta tipo="aviso">O pagamento online não está disponível agora. Combine o pagamento com a loja pelo WhatsApp.</Alerta>
      ) : !p.valor.ok ? (
        <Alerta tipo="aviso">{p.valor.precisaFrete ? 'A loja ainda vai informar o frete deste pedido. Assim que ela informar, este link libera o pagamento.' : p.valor.motivo}</Alerta>
      ) : (
        <section className="bg-card border border-borda rounded-3xl p-6 grid gap-5">
          <div className="flex justify-between items-baseline gap-3">
            <span className="rotulo text-marrom-900">Total a pagar</span>
            <span className="font-display font-extrabold text-3xl">{brl(p.valor.valor)}</span>
          </div>
          <Pagar chave={chave} valor={p.valor.valor} pix={p.pix} cartao={p.cartao} precisaEmail={p.precisaEmail} parcelasMax={p.parcelasMax} parcelasSemJuros={p.parcelasSemJuros} minutosPix={p.minutosPix} pixAtivo={pixAtivo} aviso={aviso} simulado={process.env.PAGAMENTO_GATEWAY === 'falso'} />
        </section>
      )}

      <details className="bg-card border border-borda rounded-3xl p-6 group" open={!p.pago}>
        <summary className="cursor-pointer rotulo text-marrom-900">Peças ({p.itens.reduce((a, i) => a + i.quantidade, 0)})</summary>
        <ul className="mt-4 divide-y divide-borda">
          {p.itens.map(i => (
            <li key={i.id} className="py-3 grid grid-cols-[48px_1fr_auto] gap-3 items-center text-sm">
              <div className="relative aspect-[3/4] bg-bege"><Foto src={i.imagem} alt={i.nome} sizes="48px" /></div>
              <div><div className="text-marrom-950">{i.nome}</div><div className="text-suave">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''} · {i.quantidade}×</div></div>
              <div className="font-semibold">{brl(i.preco * i.quantidade)}</div>
            </li>
          ))}
        </ul>
        <div className="border-t border-borda pt-3 grid gap-1 text-sm">
          <div className="flex justify-between"><span>Peças</span><span>{brl(subtotal)}</span></div>
          {p.cupom && p.cupom.desconto > 0 && p.tipo === 'compra' && <div className="flex justify-between text-oliva"><span>Cupom {p.cupom.codigo}</span><span>−{brl(p.cupom.desconto)}</span></div>}
          {p.tipo === 'compra' && <div className="flex justify-between"><span>Frete</span><span>{p.frete == null ? 'a combinar' : p.frete === 0 ? 'grátis' : brl(p.frete)}</span></div>}
        </div>
      </details>
    </main>
  );
}
