import { Foto } from '@/components/loja/foto';
import { Vazio } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { plural, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { linkWhatsApp } from '@/lib/whatsapp';
import { cancelarMeuPedido } from '@/server/acoes/pedidos';
import { fichaDoClienteLogado } from '@/server/consultas/clientes';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Meus pedidos' };

type Pedido = NonNullable<Awaited<ReturnType<typeof fichaDoClienteLogado>>>['pedidos'][number];

export default async function MeusPedidos() {
  const u = await exigirPapel(['cliente']);
  const cliente = await fichaDoClienteLogado(u);
  const pedidos = cliente?.pedidos ?? [];
  const vendedor = cliente?.vendedor;
  const abertos = pedidos.filter(p => p.status === 'pendente').length;

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <div>
          <h2 className="titulo text-xl">Meus pedidos</h2>
          {pedidos.length > 0 && (
            <p className="mt-1 text-sm text-suave">
              {plural(pedidos.length, 'pedido', 'pedidos')}{abertos > 0 && ` · ${plural(abertos, 'em aberto', 'em aberto')}`}
            </p>
          )}
        </div>
        {vendedor?.telefone && (
          <a href={linkWhatsApp(vendedor.telefone, `Olá, ${vendedor.name.split(' ')[0]}! Tenho uma dúvida sobre um pedido.`)} target="_blank" rel="noopener"
            className="text-sm text-suave hover:text-caramelo">
            Dúvidas? Fale com <strong className="text-marrom-950">{vendedor.name}</strong> no WhatsApp
          </a>
        )}
      </div>

      {!pedidos.length ? (
        <Vazio>Você ainda não enviou pedidos.<div className="mt-4"><BotaoLink href="/catalogo">Ver o catálogo</BotaoLink></div></Vazio>
      ) : (
        <div className="grid gap-5">
          {pedidos.map(p => <CartaoPedido key={p.id} p={p} />)}
        </div>
      )}
    </>
  );
}

function CartaoPedido({ p }: { p: Pedido }) {
  const v = valoresDoPedido(p);
  const fechado = p.tipo === 'condicional' && p.status === 'confirmado';
  const cancelamento = p.status === 'cancelado' ? textoCancelamento(p.motivoCancelamento, true) : null;

  return (
    <article className="min-w-0 bg-card border border-borda">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-borda">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display font-extrabold text-lg">{p.codigo}</span>
          <EtiquetaTipo tipo={p.tipo} />
          <EtiquetaStatus status={p.status} />
        </div>
        <div className="text-sm text-suave text-right">
          {formatarDataHora(p.criadoEm)}
          {cancelamento && <div>{cancelamento}</div>}
        </div>
      </header>

      <ul className="divide-y divide-borda">
        {p.itens.map(i => (
          <li key={i.id} className={`flex items-center gap-4 px-5 py-3 ${i.situacao === 'devolvido' ? 'opacity-50' : ''}`}>
            <div className="relative w-12 shrink-0 aspect-[3/4] bg-bege">
              <Foto src={i.imagem} alt={i.nome} sizes="48px" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{i.nome}</div>
              <div className="text-sm text-suave">
                Tam. {i.tamanho}{i.cor && ` · ${i.cor}`}{i.quantidade > 1 && ` · ${i.quantidade} un.`}
                {fechado && <> · <span className={i.situacao === 'vendido' ? 'text-oliva font-semibold' : ''}>{i.situacao === 'vendido' ? 'Ficou' : 'Voltou'}</span></>}
              </div>
            </div>
            <div className="text-sm font-semibold whitespace-nowrap">{brl(Number(i.precoUnitario) * i.quantidade)}</div>
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-borda bg-bege/40">
        <span className="text-sm text-suave">
          {plural(v.unidades, 'peça', 'peças')}
          {v.ficaram != null && ` · ${v.ficaram ? plural(v.ficaram, 'ficou', 'ficaram') : 'nenhuma ficou'}`}
          {v.codigoCupom && <> · cupom <strong className="text-oliva">{v.codigoCupom}</strong> {v.freteCupom ? '(frete grátis)' : `(−${brl(v.cupom)})`}</>}
          {v.frete != null && !v.freteCupom && ` · frete ${v.frete ? brl(v.frete) : 'grátis'}`}
          {v.freteACombinar && ' · frete a combinar'}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 ml-auto">
          {p.status === 'pendente' && (
            <BotaoAcao acao={cancelarMeuPedido.bind(null, p.id)} confirmar={`Cancelar ${p.codigo}? As peças voltam a ficar disponíveis.`}
              className="rotulo !text-[0.65rem] text-suave underline underline-offset-4 hover:text-vermelho">
              Cancelar {p.tipo === 'condicional' ? 'condicional' : 'pedido'}
            </BotaoAcao>
          )}
          <span className="text-right">
            <span className="rotulo !text-[0.6rem] text-suave mr-2">Total</span>
            <span className="font-display font-extrabold text-lg">{brl(v.total)}</span>
          </span>
        </div>
      </footer>
    </article>
  );
}
