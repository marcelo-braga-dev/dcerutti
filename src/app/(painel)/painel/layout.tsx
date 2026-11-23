import { cookies } from 'next/headers';
import { Logo } from '@/components/ui/logo';
import { SinalEquipe } from '@/components/painel/sinal-equipe';
import { marcaAtual } from '@/server/marca';
import { AbasDaPagina, Navegacao } from '@/components/painel/navegacao';
import { COOKIE_RECOLHIDO, menuDoPainel } from '@/lib/menu-painel';
import { BarraSuperior } from '@/components/painel/barra-superior';
import { resumoNotificacoes } from '@/server/notificacoes';
import { sair } from '@/server/acoes/conta';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { contarPendentes } from '@/server/consultas/pedidos';
import { contarFila } from '@/server/consultas/atendimento';
import { lerConfig } from '@/server/config';
import { modoPagamento } from '@/server/pagamentos/gateway';

export async function generateMetadata() {
  return { title: { default: 'Painel', template: `%s · Painel ${(await marcaAtual()).nome}` } };
}

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const u = await exigirPapel(EQUIPE);
  const [pendentes, marca, notificacoes, cfg] = await Promise.all([contarPendentes(u), marcaAtual(), resumoNotificacoes(u.id), lerConfig()]);
  const gestor = u.papel === 'gestor';
  // D-35: áreas diretas na coluna e as páginas irmãs em abas; o mesmo desenho vira a coluna, a gaveta do celular e as abas.
  const menu = menuDoPainel(gestor, pendentes, {
    atendimento: cfg.atendimento.ligado ? { fila: await contarFila(u) } : null, vitrines: cfg.vitrines.ligadas, pagamentos: cfg.pagamentoOnline.ligado,
  });
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
        {/* docs/28, R-01: o modo do pagamento online à vista do gestor quando não é o Mercado Pago de verdade. */}
        {gestor && modoPagamento() === 'bloqueado' && (
          <div role="alert" className="my-3 border border-vermelho bg-vermelho/10 text-vermelho px-4 py-3 text-sm font-semibold">
            Pagamento online bloqueado: o modo simulado (PAGAMENTO_GATEWAY=falso) foi pedido no banco de produção. Retire a linha do .env e recarregue o app.
          </div>
        )}
        {gestor && cfg.pagamentoOnline.ligado && modoPagamento() === 'simulado' && (
          <div className="my-3 border border-dashed border-caramelo bg-bege/60 px-4 py-2 text-sm">
            Pagamento online em <strong>modo simulado</strong> (ambiente de teste): nada é cobrado de verdade.
          </div>
        )}
        <AbasDaPagina menu={menu} />{children}
      </main>
      {/* D-26: presença e envios pelo WhatsApp para o acompanhamento da equipe. */}
      <SinalEquipe />
    </div>
  );
}
