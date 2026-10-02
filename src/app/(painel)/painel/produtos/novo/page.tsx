import Link from 'next/link';
import { FormProduto } from '@/components/painel/form-produto';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { exigirPapel } from '@/server/permissoes';
import { marcasECategorias } from '@/server/consultas/produtos';

export const metadata = { title: 'Novo produto' };

export default async function NovoProduto() {
  const u = await exigirPapel(['gestor']);
  const { marcas, categorias } = await marcasECategorias(u);
  return (
    <>
      <Link href="/painel/produtos" className="rotulo text-suave hover:text-marrom-950">← Produtos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Produtos" titulo="Cadastrar produto">Depois de salvar, adicione os tamanhos e o estoque.</CabecalhoPagina>
      <Cartao className="p-5 sm:p-8"><FormProduto marcas={marcas} categorias={categorias} /></Cartao>
    </>
  );
}
