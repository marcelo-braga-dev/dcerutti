import { cartaoDoPedido } from '@/server/cartao-pedido';
import { pedidoPublico } from '@/server/consultas/pedido-publico';
import { codigoDaChave } from '@/server/link-pedido';

/**
 * Imagem do cartão do pedido (D-20), usada na prévia do link no WhatsApp. Pública: quem busca a prévia é o aparelho
 * da cliente, sem a sessão do site; a chave assinada impede chegar a outros pedidos.
 */
export async function GET(_: Request, { params }: { params: Promise<{ chave: string }> }) {
  const codigo = codigoDaChave(decodeURIComponent((await params).chave));
  const pedido = codigo ? await pedidoPublico(codigo) : null;
  if (!pedido) return new Response('Não encontrado', { status: 404 });
  const imagem = await cartaoDoPedido(pedido);
  return new Response(new Uint8Array(imagem), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(imagem.length),
      // Curto: o vendedor pode editar o pedido e o cartão muda.
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}
