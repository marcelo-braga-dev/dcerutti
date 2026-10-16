import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { SinalEquipe } from '@/components/painel/sinal-equipe';
import { marcaAtual } from '@/server/marca';
import { AbasDoGrupo, Navegacao } from '@/components/painel/navegacao';
import { menuDoPainel } from '@/lib/menu-painel';
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
  // Menu com grupos (Vendas, Clientes, Equipe, Loja): o mesmo desenho vira o menu lateral, a gaveta do celular e as abas.
  const menu = menuDoPainel(gestor, pendentes);
  const rodape = (
    <div className="grid gap-1 rotulo">
      <Link href="/" className="px-3 py-2 text-areia hover:text-creme">Ver loja</Link>
      <form action={sair}><button className="w-full text-left px-3 py-2 rotulo text-areia hover:text-creme">Sair</button></form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-marrom-950 text-creme lg:sticky lg:top-0 lg:h-dvh flex flex-col gap-4 p-4 lg:p-5 lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link href="/painel" aria-label={`Painel ${marca.nome}`}><Logo img={marca.logoClara} alt="" className="h-11 w-auto" /></Link>
          <div className="lg:mt-4 text-right lg:text-left">
            <div className="text-sm text-creme">{u.name}</div>
            <div className="rotulo !text-[0.6rem] text-areia">{gestor ? 'Gestor' : 'Vendedor'}</div>
          </div>
        </div>
        <Navegacao menu={menu} rodape={rodape} />
        <div className="hidden lg:block mt-auto">{rodape}</div>
      </aside>
      <main className="p-4 sm:p-8 min-w-0"><AbasDoGrupo menu={menu} />{children}</main>
      {/* D-26: presença e envios pelo WhatsApp para o acompanhamento da equipe. */}
      <SinalEquipe />
    </div>
  );
}
