import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { IconeLoja, IconeSair } from '@/components/ui/icones';
import { SinalEquipe } from '@/components/painel/sinal-equipe';
import { marcaAtual } from '@/server/marca';
import { AbasDoGrupo, Navegacao } from '@/components/painel/navegacao';
import { menuDoPainel } from '@/lib/menu-painel';
import { BarraSuperior } from '@/components/painel/barra-superior';
import { resumoNotificacoes } from '@/server/notificacoes';
import { sair } from '@/server/acoes/conta';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { contarPendentes } from '@/server/consultas/pedidos';
import { contarFila } from '@/server/consultas/atendimento';
import { lerConfig } from '@/server/config';

export async function generateMetadata() {
  return { title: { default: 'Painel', template: `%s · Painel ${(await marcaAtual()).nome}` } };
}

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const u = await exigirPapel(EQUIPE);
  const [pendentes, marca, notificacoes, cfg] = await Promise.all([contarPendentes(u), marcaAtual(), resumoNotificacoes(u.id), lerConfig()]);
  const gestor = u.papel === 'gestor';
  // Menu com grupos (Vendas, Clientes, Equipe, Loja): o mesmo desenho vira o menu lateral, a gaveta do celular e as abas.
  const menu = menuDoPainel(gestor, pendentes, cfg.atendimento.ligado ? { fila: await contarFila(u) } : null, cfg.vitrines.ligadas);
  const primeiro = u.name.split(' ')[0];
  const rodape = (
    <div className="grid gap-1 text-sm">
      <Link href="/" className="h-10 px-3 rounded-xl flex items-center gap-3 text-areia hover:text-creme hover:bg-creme/10"><IconeLoja className="size-[1.15rem]" />Ver loja</Link>
      <form action={sair}><button className="w-full h-10 px-3 rounded-xl flex items-center gap-3 text-areia hover:text-creme hover:bg-creme/10"><IconeSair className="size-[1.15rem]" />Sair</button></form>
    </div>
  );

  return (
    <div className="painel min-h-dvh bg-creme lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="bg-marrom-950 text-creme lg:sticky lg:top-0 lg:h-dvh flex flex-col gap-5 p-4 lg:p-5 lg:overflow-y-auto sem-barra">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link href="/painel" aria-label={`Painel ${marca.nome}`} className="lg:block lg:px-2 lg:pt-1"><Logo img={marca.logoClara} alt="" className="h-10 lg:h-12 w-auto" /></Link>
          <div className="lg:hidden text-right">
            <div className="text-sm text-creme">{u.name}</div>
            <div className="text-[0.7rem] text-areia">{gestor ? 'Gestor' : 'Vendedor'}</div>
          </div>
        </div>
        <Navegacao menu={menu} rodape={rodape} />
        <div className="hidden lg:block mt-auto pt-4 border-t border-creme/10">
          <div className="flex items-center gap-3 px-2 mb-3">
            <span className="size-10 shrink-0 grid place-items-center rounded-full bg-caramelo text-creme font-bold">{primeiro[0]}</span>
            <div className="min-w-0"><div className="text-sm text-creme font-semibold truncate">{u.name}</div><div className="text-xs text-areia">{gestor ? 'Gestor' : 'Vendedor'}</div></div>
          </div>
          {rodape}
        </div>
      </aside>
      <main className="px-4 pb-10 sm:px-8 min-w-0">
        {/* D-28: barra superior com busca, atalhos e o sino das notificações. */}
        <BarraSuperior resumoInicial={notificacoes} pendentes={pendentes} nome={u.name} papel={gestor ? 'Gestor' : 'Vendedor'} sair={sair} />
        <AbasDoGrupo menu={menu} />{children}
      </main>
      {/* D-26: presença e envios pelo WhatsApp para o acompanhamento da equipe. */}
      <SinalEquipe />
    </div>
  );
}
