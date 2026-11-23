import { cookies } from 'next/headers';
import { Logo } from '@/components/ui/logo';
import { SinalEquipe } from '@/components/painel/sinal-equipe';
import { marcaAtual } from '@/server/marca';
import { AbasDoGrupo, Navegacao } from '@/components/painel/navegacao';
import { COOKIE_RECOLHIDO, menuDoPainel } from '@/lib/menu-painel';
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
  const menu = menuDoPainel(gestor, pendentes, cfg.atendimento.ligado ? { fila: await contarFila(u) } : null, cfg.vitrines.ligadas, cfg.pagamentoOnline.ligado);
  // Coluna recolhida: lida do cookie aqui, para a página já chegar desenhada certo.
  const recolhido = (await cookies()).get(COOKIE_RECOLHIDO)?.value === '1';
  const papel = gestor ? 'Gestor' : 'Vendedor';

  return (
    <div className="painel min-h-dvh bg-creme lg:flex">
      <Navegacao menu={menu} usuario={{ nome: u.name, papel }} sair={sair} recolhidoInicial={recolhido} monograma={marca.nome.trim()[0]?.toUpperCase() ?? ''}
        logo={<Logo img={marca.logoClara} alt="" className="h-10 w-auto" />} />
      <main className="flex-1 px-4 pb-10 sm:px-8 min-w-0">
        {/* D-28: barra superior com busca, atalhos e o sino das notificações. */}
        <BarraSuperior resumoInicial={notificacoes} pendentes={pendentes} nome={u.name} papel={papel} sair={sair} />
        <AbasDoGrupo menu={menu} />{children}
      </main>
      {/* D-26: presença e envios pelo WhatsApp para o acompanhamento da equipe. */}
      <SinalEquipe />
    </div>
  );
}
