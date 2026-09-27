import Link from 'next/link';
import { Montador } from '@/components/painel/montador';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { emEstoque } from '@/lib/catalogo';
import { catalogo } from '@/server/catalogo';
import { db } from '@/server/db';
import { EQUIPE, escopoVendedor, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Novo pedido' };

export default async function NovoPedido({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const [clientes, lista] = await Promise.all([
    db.cliente.findMany({ where: escopoVendedor(u), select: { id: true, nome: true, telefone: true }, orderBy: { nome: 'asc' } }),
    catalogo(),
  ]);
  const produtos = lista.filter(emEstoque).map(p => ({
    id: p.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, categoria: p.categoria, preco: p.preco,
    imagem: p.imagens[0] ?? null, variantes: p.variantes.filter(v => v.disponivel > 0),
  }));
  const { cliente } = await searchParams;

  return (
    <>
      <Link href="/painel/pedidos" className="rotulo text-suave hover:text-marrom-950">← Pedidos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Seleção para o cliente" titulo="Novo pedido">
        Escolha as peças e envie ao cliente pelo WhatsApp, com uma imagem da seleção.
      </CabecalhoPagina>
      <Montador clientes={clientes} produtos={produtos} clienteInicial={clientes.some(c => c.id === cliente) ? cliente! : ''} vendedor={u.name} />
    </>
  );
}
