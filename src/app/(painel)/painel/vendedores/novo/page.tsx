import Link from 'next/link';
import { FormVendedor } from '@/components/painel/form-vendedor';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Novo vendedor' };

export default async function NovoVendedor() {
  await exigirPapel(['gestor']);
  return (
    <>
      <Link href="/painel/vendedores" className="rotulo text-suave hover:text-marrom-950">← Vendedores</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Equipe" titulo="Cadastrar vendedor" />
      <Cartao className="p-5 sm:p-8 max-w-3xl"><FormVendedor /></Cartao>
    </>
  );
}
