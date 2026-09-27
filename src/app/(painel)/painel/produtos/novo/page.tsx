import Link from 'next/link';
import { FormProduto } from '@/components/painel/form-produto';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { db } from '@/server/db';
import { exigirPapel } from '@/server/permissoes';
import { r2Configurado } from '@/server/r2';

export const metadata = { title: 'Novo produto' };

export default async function NovoProduto() {
  await exigirPapel(['gestor']);
  const [marcas, categorias] = await Promise.all([db.marca.findMany({ orderBy: { nome: 'asc' } }), db.categoria.findMany({ orderBy: { nome: 'asc' } })]);
  return (
    <>
      <Link href="/painel/produtos" className="rotulo text-suave hover:text-marrom-950">← Produtos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Produtos" titulo="Cadastrar produto">Depois de salvar, adicione os tamanhos e o estoque.</CabecalhoPagina>
      <Cartao className="p-5 sm:p-8"><FormProduto marcas={marcas} categorias={categorias} upload={r2Configurado()} /></Cartao>
    </>
  );
}
