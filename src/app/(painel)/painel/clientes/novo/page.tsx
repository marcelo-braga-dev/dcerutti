import Link from 'next/link';
import { FormCliente } from '@/components/painel/form-cliente';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { db } from '@/server/db';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Novo cliente' };

export default async function NovoCliente() {
  const u = await exigirPapel(EQUIPE);
  const vendedores = u.papel === 'gestor' ? await db.user.findMany({ where: { papel: 'vendedor', ativo: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : undefined;
  return (
    <>
      <Link href="/painel/clientes" className="rotulo text-suave hover:text-marrom-950">← Clientes</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Clientes" titulo="Cadastrar cliente" />
      <Cartao className="p-5 sm:p-8 max-w-3xl"><FormCliente vendedores={vendedores} /></Cartao>
    </>
  );
}
