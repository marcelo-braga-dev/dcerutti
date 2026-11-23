import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import QRCode from 'qrcode';
import { Foto } from '@/components/loja/foto';
import { Pagar } from '@/components/pagamento/pagar';
import { Alerta } from '@/components/ui/basicos';
import { Logo } from '@/components/ui/logo';
import { brl } from '@/lib/dinheiro';
import { descreverMeio } from '@/lib/pagamento';
import { formatarDataHora } from '@/lib/datas';
import { pedidoParaPagar } from '@/server/consultas/pagamentos';
import { codigoDaChavePagamento } from '@/server/link-pedido';
import { marcaAtual } from '@/server/marca';
import { conciliarDoPedido } from '@/server/pagamentos/cobrancas';
import { simuladoAtivo } from '@/server/pagamentos/gateway';

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
  const [p, marca] = await Promise.all([pedidoParaPagar(codigo), marcaAtual()]);
  const nome = marca.nome;
  if (!p) notFound();
  after(() => conciliarDoPedido(codigo));

  const pixAtivo = p.pixAtivo?.pixCopiaECola
    ? { copiaECola: p.pixAtivo.pixCopiaECola, expiraEm: p.pixAtivo.expiraEm?.toISOString() ?? null, qrSvg: await QRCode.toString(p.pixAtivo.pixCopiaECola, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }
    : null;
  const subtotal = Math.round(p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0) * 100) / 100;
  const recusada = p.ultima?.status === 'recusada' && !p.pago;
  const aviso = r && AVISO_RETORNO[r] && !p.pago ? AVISO_RETORNO[r] : recusada ? AVISO_RETORNO.falha : null;

  return (
    <main className="loja mx-auto max-w-xl px-4 sm:px-8 py-8 sm:py-12 grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" aria-label={nome}><Logo img={marca.logo} className="h-10 sm:h-12 w-auto mix-blend-multiply" prioridade /></Link>
        <span className="h-8 px-3 rounded-full bg-card border border-borda text-xs font-semibold text-oliva inline-flex items-center gap-1.5"><IconeCadeado /> Pagamento seguro</span>
      </div>
      <header className="grid gap-1">
        <div className="rotulo !text-[0.66rem] text-caramelo">{p.tipo === 'condicional' ? 'Condicional' : 'Pedido'} {p.codigo}</div>
        <h1 className="titulo text-[2rem] sm:text-4xl">{p.pago ? 'Pagamento aprovado' : `Olá${p.primeiroNome ? `, ${p.primeiroNome}` : ''}!`}</h1>
        {!p.pago && p.valor.ok && <p className="text-suave">Falta só o pagamento. Escolha Pix (aprovação na hora) ou cartão.</p>}
      </header>

      {p.pago ? (
        <section className="bg-card border border-oliva/50 rounded-[2rem] p-6 sm:p-8 grid gap-4 justify-items-center text-center">
          <span className="size-16 rounded-full bg-oliva text-creme grid place-items-center shadow-lg shadow-oliva/20" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <p className="text-lg">Recebemos <strong>{brl(p.pago.valor)}</strong> ({descreverMeio(p.pago)}){p.pago.aprovadaEm ? ` em ${formatarDataHora(p.pago.aprovadaEm)}` : ''}.</p>
          <p className="text-suave max-w-sm">A loja já foi avisada e combina a entrega com você pelo WhatsApp. Obrigada pela compra!</p>
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
        <section className="bg-card border border-borda rounded-[2rem] p-5 sm:p-7 grid gap-5 shadow-xl shadow-marrom-950/5">
          <div className="flex justify-between items-baseline gap-3">
            <span className="rotulo text-marrom-900">Total a pagar</span>
            <span className="font-display font-extrabold text-3xl">{brl(p.valor.valor)}</span>
          </div>
          <Pagar chave={chave} valor={p.valor.valor} pix={p.pix} cartao={p.cartao} precisaEmail={p.precisaEmail} parcelasMax={p.parcelasMax} parcelasSemJuros={p.parcelasSemJuros} minutosPix={p.minutosPix} pixAtivo={pixAtivo} aviso={aviso} simulado={simuladoAtivo()} />
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
      {!p.pago && p.ligado && p.valor.ok && (
        <ul className="grid sm:grid-cols-3 gap-2 text-xs text-suave">
          {[['Pagamento pelo Mercado Pago', 'Ambiente seguro e criptografado'], ['A loja não vê seu cartão', 'Os dados ficam só com o Mercado Pago'], ['Confirmação na hora', 'A loja é avisada assim que o pagamento cai']].map(([t, d]) => (
            <li key={t} className="bg-card border border-borda rounded-2xl p-3 flex gap-2"><span className="text-oliva mt-0.5"><IconeCadeado /></span><span><strong className="block text-marrom-950 text-[0.8rem]">{t}</strong>{d}</span></li>
          ))}
        </ul>
      )}
    </main>
  );
}

function IconeCadeado() {
  return <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>;
}
