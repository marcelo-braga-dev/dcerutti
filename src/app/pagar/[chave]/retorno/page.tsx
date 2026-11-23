import { redirect } from 'next/navigation';
import { ultimoCheckoutDoPedido } from '@/server/consultas/pagamentos';
import { codigoDaChavePagamento } from '@/server/link-pedido';
import { sincronizarCobranca } from '@/server/pagamentos/cobrancas';

type Props = { params: Promise<{ chave: string }>; searchParams: Promise<{ r?: string }> };

/**
 * Volta do checkout do Mercado Pago (docs/27). Os parâmetros da URL não valem nada sozinhos: consulta a order na API,
 * aplica e mostra a página do pagamento com a situação real.
 */
export default async function RetornoDoCheckout({ params, searchParams }: Props) {
  const [{ chave: bruta }, { r }] = await Promise.all([params, searchParams]);
  const chave = decodeURIComponent(bruta);
  const codigo = codigoDaChavePagamento(chave);
  if (!codigo) redirect('/');
  const c = await ultimoCheckoutDoPedido(codigo);
  if (c) await sincronizarCobranca(c.id, 'retorno').catch(e => console.error('Pagamento: falha ao conferir o retorno do checkout', codigo, e instanceof Error ? e.message : e));
  const motivo = r === 'falha' || r === 'pendente' ? `?r=${r}` : '';
  redirect(`/pagar/${encodeURIComponent(chave)}${motivo}`);
}
