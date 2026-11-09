import { cartaoDoPedido } from '@/server/cartao-pedido';
import { pecaPublica } from '@/server/consultas/peca-publica';

/** Cartão da peça para a prévia do link no WhatsApp (docs/26): foto e preço, sem dados de cliente nem estoque. */
export async function GET(_: Request, { params }: { params: Promise<{ chave: string }> }) {
  const p = await pecaPublica(decodeURIComponent((await params).chave));
  if (!p) return new Response('Não encontrado', { status: 404 });
  const tamanhos = p.variantes.map(v => v.tamanho).join(', ');
  const imagem = await cartaoDoPedido(
    { codigo: p.referencia, tipo: 'compra', status: 'pendente', pecas: 1, total: p.preco, frete: null, itens: [{ id: p.produtoId, nome: p.nome, tamanho: '', quantidade: 1, preco: p.preco, imagem: p.imagens[0] ?? null }] },
    { selo: 'PEÇA PARA VOCÊ', valorRotulo: 'Valor', extra: tamanhos ? `Tamanhos: ${tamanhos}` : 'Fale com a loja' },
  );
  return new Response(new Uint8Array(imagem), {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(imagem.length), 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
  });
}
