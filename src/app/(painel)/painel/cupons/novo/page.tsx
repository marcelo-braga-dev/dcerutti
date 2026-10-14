import Link from 'next/link';
import { FormCupom } from '@/components/painel/form-cupom';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { formatarTelefone } from '@/lib/telefone';
import { opcoesDoCupom } from '@/server/consultas/cupons';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Novo cupom' };

export default async function NovoCupom() {
  const u = await exigirPapel(['gestor']);
  const o = await opcoesDoCupom(u);
  return (
    <>
      <Link href="/painel/cupons" className="rotulo text-suave hover:text-marrom-950">← Cupons</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Cupons" titulo="Novo cupom" />
      <Cartao className="p-5 sm:p-8 max-w-4xl">
        <FormCupom usado={false}
          opcoes={{
            categorias: o.categorias.map(c => ({ valor: String(c.id), rotulo: c.nome })),
            marcas: o.marcas.map(m => ({ valor: String(m.id), rotulo: m.nome })),
            clientes: o.clientes.map(c => ({ valor: c.id, rotulo: c.nome, detalhe: formatarTelefone(c.telefone) })),
          }}
          inicial={{
            codigo: '', descricao: '', tipo: 'percentual', valor: '', tetoDesconto: '', minimoCompra: '', inicio: '', fim: '', limiteTotal: '',
            limitePorCliente: '1', quemAplica: 'ambos', somentePrimeiraCompra: false, valePromocao: false, ativo: true,
            categorias: [], marcas: [], clientes: [], referencias: '',
          }} />
      </Cartao>
    </>
  );
}
