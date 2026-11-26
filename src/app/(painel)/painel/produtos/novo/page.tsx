import Link from 'next/link';
import { FormProduto } from '@/components/painel/form-produto';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { IconeVoltar } from '@/components/ui/icones';
import { exigirPapel } from '@/server/permissoes';
import { marcasECategorias } from '@/server/consultas/produtos';

export const metadata = { title: 'Novo produto' };

export default async function NovoProduto() {
  const u = await exigirPapel(['gestor']);
  const { marcas, categorias } = await marcasECategorias(u);
  return (
    <>
      <Link href="/painel/produtos" className="inline-flex items-center gap-1 text-sm text-suave hover:text-marrom-950"><IconeVoltar className="size-4" />Produtos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Produtos" titulo="Cadastrar produto">
        4 etapas · <span className="text-vermelho">*</span> obrigatório · tamanhos e estoque vêm depois.
      </CabecalhoPagina>
      <FormProduto marcas={marcas} categorias={categorias} />
    </>
  );
}
