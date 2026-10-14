import Link from 'next/link';
import { Montador } from '@/components/painel/montador';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { buscarPecas } from '@/server/acoes/pedidos';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { clientesParaSelecao } from '@/server/consultas/clientes';
import { cuponsParaDivulgar } from '@/server/consultas/cupons';
import { lerConfig } from '@/server/config';
import { regraEmPalavras } from '@/lib/cupom';

export const metadata = { title: 'Novo pedido' };

export default async function NovoPedido({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const [clientes, iniciais, cfg] = await Promise.all([clientesParaSelecao(u), buscarPecas(''), lerConfig()]);
  // Fase 3 dos cupons: só com os cupons ligados e o vendedor liberado (o gestor sempre).
  const cupons = cfg.cupons.ligados && (u.papel === 'gestor' || cfg.cupons.vendedorAplica)
    ? (await cuponsParaDivulgar(u)).filter(c => c.quemAplica !== 'cliente' && c.situacao === 'ativo')
        .map(c => ({ codigo: c.codigo, regra: regraEmPalavras(c.regra, c.nomes), clientes: c.especifico ? c.clientes.map(x => x.id) : null }))
    : undefined;
  const { cliente, tipo } = await searchParams;

  return (
    <>
      <Link href="/painel/pedidos" className="rotulo text-suave hover:text-marrom-950">← Pedidos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Seleção para o cliente" titulo="Novo pedido">
        Escolha as peças e envie ao cliente pelo WhatsApp, com uma imagem da seleção.
      </CabecalhoPagina>
      <Montador clientes={clientes} iniciais={iniciais} clienteInicial={clientes.some(c => c.id === cliente) ? cliente! : ''} vendedor={u.name} tipoInicial={tipo === 'balcao' || tipo === 'condicional' ? tipo : 'compra'} cupons={cupons} />
    </>
  );
}
