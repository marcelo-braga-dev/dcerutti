import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormVitrine } from '@/components/painel/form-vitrine';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { vitrinesLigadas } from '@/server/consultas/vitrines';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Nova vitrine' };

export default async function NovaVitrine() {
  const u = await exigirPapel(EQUIPE);
  if (!(await vitrinesLigadas())) notFound();
  return (
    <>
      <Link href="/painel/vitrines" className="rotulo text-suave hover:text-marrom-950">← Vitrines</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Vendas" titulo="Nova vitrine">Depois de criar, você adiciona as peças e publica.</CabecalhoPagina>
      <Cartao className="p-5 sm:p-8 max-w-3xl"><FormVitrine vendedoras={u.papel === 'gestor' ? await vendedoresAtivos() : undefined} /></Cartao>
    </>
  );
}
