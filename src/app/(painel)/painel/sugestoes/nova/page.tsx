import Link from 'next/link';
import { MontarSugestao } from '@/components/painel/montar-sugestao';
import { CabecalhoPagina } from '@/components/ui/basicos';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { clientesParaSelecao } from '@/server/consultas/clientes';
import { lerConfig } from '@/server/config';
import { pecasParaDuplicar } from '@/server/acoes/sugestoes';

export const metadata = { title: 'Montar sugestão' };

export default async function NovaSugestao({ searchParams }: { searchParams: Promise<{ cliente?: string; de?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const [clientes, cfg, sp] = await Promise.all([clientesParaSelecao(u), lerConfig(), searchParams]);
  // Duplicar (fase 2): começa com as peças, o título, a mensagem e o cupom de outra sugestão.
  const inicial = sp.de ? await pecasParaDuplicar(sp.de) : null;
  return (
    <>
      <Link href="/painel/sugestoes" className="rotulo text-suave hover:text-marrom-950">← Sugestões enviadas</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Sugestões" titulo="Montar sugestão para a cliente">
        Escolha as peças e envie pelo WhatsApp. A cliente recebe o link com as fotos, marca o que quer, escolhe tamanho e cor e devolve como pedido.
      </CabecalhoPagina>
      <MontarSugestao clientes={clientes} clienteInicial={clientes.some(c => c.id === sp.cliente) ? sp.cliente : undefined}
        limite={cfg.caixa.descontoMaxVendedor} gestor={u.papel === 'gestor'} inicial={inicial}
        cupons={cfg.cupons.ligados && (u.papel === 'gestor' || cfg.cupons.vendedorAplica)} />
    </>
  );
}
