import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { marcaAtual } from '@/server/marca';
import { Navegacao, type ItemNav } from '@/components/painel/navegacao';
import { sair } from '@/server/acoes/conta';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { contarPendentes } from '@/server/consultas/pedidos';

export async function generateMetadata() {
  return { title: { default: 'Painel', template: `%s · Painel ${(await marcaAtual()).nome}` } };
}

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const u = await exigirPapel(EQUIPE);
  const [pendentes, marca] = await Promise.all([contarPendentes(u), marcaAtual()]);
  const gestor = u.papel === 'gestor';
  const itens: ItemNav[] = [
    { href: '/painel', rotulo: gestor ? 'Resumo' : 'Meu painel' },
    { href: '/painel/pedidos', rotulo: 'Pedidos', contador: pendentes },
    // Caixa da loja física (D-23): tela própria, em /caixa.
    { href: '/caixa', rotulo: 'Caixa da loja' },
    { href: '/painel/clientes', rotulo: gestor ? 'Clientes' : 'Meus clientes' },
    // Histórico do cliente (docs/21): o que as clientes veem e procuram na loja.
    { href: '/painel/interesse', rotulo: 'Interesse' },
    { href: '/painel/vendas', rotulo: 'Vendas' },
    // Cupons: o gestor cria e liga; o vendedor vê os disponíveis para divulgar (docs/20-cupons.md).
    { href: '/painel/cupons', rotulo: 'Cupons' },
    ...(gestor
      ? [
          { href: '/painel/resultados', rotulo: 'Resultados' },
          { href: '/painel/produtos', rotulo: 'Produtos' },
          { href: '/painel/vendedores', rotulo: 'Vendedores' },
          { href: '/painel/configuracoes', rotulo: 'Configurações' },
          // D-25: cores, logos e favicon.
          { href: '/painel/identidade', rotulo: 'Identidade visual' },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-marrom-950 text-creme lg:sticky lg:top-0 lg:h-dvh flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex items-center justify-between lg:block">
          <Link href="/painel" aria-label={`Painel ${marca.nome}`}><Logo img={marca.logoClara} alt="" className="h-11 w-auto" /></Link>
          <div className="lg:mt-4 text-right lg:text-left">
            <div className="text-sm text-creme">{u.name}</div>
            <div className="rotulo !text-[0.6rem] text-areia">{gestor ? 'Gestor' : 'Vendedor'}</div>
            {/* B-02: no celular, Ver loja e Sair ficam aqui; no computador, no pé do menu. */}
            <div className="lg:hidden mt-1 flex justify-end gap-3 rotulo !text-[0.6rem]">
              <Link href="/" className="text-areia hover:text-creme">Ver loja</Link>
              <form action={sair}><button className="rotulo !text-[0.6rem] text-areia hover:text-creme">Sair</button></form>
            </div>
          </div>
        </div>
        <Navegacao itens={itens} />
        <div className="hidden lg:grid gap-1 mt-auto rotulo">
          <Link href="/" className="px-3 py-2 text-areia hover:text-creme">Ver loja</Link>
          <form action={sair}><button className="w-full text-left px-3 py-2 rotulo text-areia hover:text-creme">Sair</button></form>
        </div>
      </aside>
      <main className="p-4 sm:p-8 min-w-0">{children}</main>
    </div>
  );
}
