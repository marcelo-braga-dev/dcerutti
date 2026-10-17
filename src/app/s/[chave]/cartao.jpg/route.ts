import { cartaoDoPedido } from '@/server/cartao-pedido';
import { codigoDaChaveSugestao } from '@/server/link-pedido';
import { sugestaoPublica } from '@/server/sugestoes';

/** Cartão da sugestão (D-27) para a prévia do link no WhatsApp: as fotos das peças sugeridas, sem dados da cliente. */
export async function GET(_: Request, { params }: { params: Promise<{ chave: string }> }) {
  const codigo = codigoDaChaveSugestao(decodeURIComponent((await params).chave));
  const s = codigo ? await sugestaoPublica(codigo) : null;
  if (!s) return new Response('Não encontrado', { status: 404 });
  const itens = s.itens.map(i => {
    const cor = i.cores.find(c => c.produtoId === i.corInicial) ?? i.cores[0];
    const v = cor?.variantes.find(x => x.id === i.varianteInicial);
    return { id: i.id, nome: i.nome, tamanho: v?.tamanho ?? '', quantidade: 1, preco: i.preco, imagem: cor?.imagem ?? null };
  });
  const ofertas = s.itens.some(i => i.oferta != null && i.preco < i.precoCatalogo);
  const ate = s.validaAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const imagem = await cartaoDoPedido(
    { codigo: s.codigo, tipo: 'compra', status: 'pendente', pecas: itens.length, total: itens.reduce((a, i) => a + i.preco, 0), frete: null, itens },
    { selo: 'SUGESTÕES PARA VOCÊ', valorRotulo: 'Valor das peças', extra: ofertas ? `Preços especiais até ${ate}` : 'Escolha o que quiser' },
  );
  return new Response(new Uint8Array(imagem), {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(imagem.length), 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
  });
}
