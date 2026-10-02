import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { FecharPedido } from '@/components/painel/fechar-pedido';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp, mensagemContato } from '@/lib/whatsapp';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { pedidoParaEquipe } from '@/server/consultas/pedidos';

export default async function DetalhePedido({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const p = await pedidoParaEquipe(u, (await params).id);
  if (!p) notFound();
  const cond = p.tipo === 'condicional';

  return (
    <>
      <Link href="/painel/pedidos" className="rotulo text-suave hover:text-marrom-950">← Pedidos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={p.origem === 'vendedor' ? 'Seleção do vendedor' : 'Loja online'} titulo={p.codigo}
        acoes={<a href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener" className={botao('oliva')}>WhatsApp do cliente</a>}>
        <span className="inline-flex gap-2 flex-wrap items-center"><EtiquetaTipo tipo={p.tipo} /> <EtiquetaStatus status={p.status} /> {formatarDataHora(p.criadoEm)}</span>
      </CabecalhoPagina>

      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6">
        <Cartao className="p-5 sm:p-6">
          <h2 className="titulo text-lg mb-4">Peças</h2>
          <ul className="divide-y divide-borda">
            {p.itens.map(i => (
              <li key={i.id} className={`py-4 grid grid-cols-[64px_1fr_auto] gap-4 items-start ${i.situacao === 'devolvido' ? 'opacity-50' : ''}`}>
                <div className="relative aspect-[3/4] bg-bege"><Foto src={i.imagem} alt={i.nome} sizes="64px" /></div>
                <div className="text-sm">
                  <Link href={`/produto/${i.referencia}`} className="text-marrom-950 font-semibold hover:underline">{i.nome}</Link>
                  <div className="text-suave">{i.marca} · Ref. {i.referencia}{i.cor ? ` · ${i.cor}` : ''}</div>
                  <div className="mt-1 flex flex-wrap gap-2 items-center">
                    <Etiqueta cor="escuro">Tam. {i.tamanho}</Etiqueta>
                    {i.codigoInterno && <Etiqueta>Cód. {i.codigoInterno}</Etiqueta>}
                    {i.situacao === 'vendido' && cond && <Etiqueta cor="oliva">Ficou</Etiqueta>}
                    {i.situacao === 'devolvido' && <Etiqueta cor="cinza">Voltou</Etiqueta>}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div>{i.quantidade} x {brl(i.precoUnitario)}</div>
                  <div className="font-display font-extrabold">{brl(i.precoUnitario.mul(i.quantidade))}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-borda pt-4 font-display font-extrabold text-lg">
            <span>Total do pedido</span><span>{brl(p.total)}</span>
          </div>
          {p.venda && <p className="mt-2 text-sm text-oliva">Venda registrada: {brl(p.venda.valor)} em {formatarDataHora(p.venda.data)}.</p>}
        </Cartao>

        <div className="grid gap-6 content-start">
          <Cartao className="p-5 sm:p-6 grid gap-2 text-sm">
            <h2 className="titulo text-lg mb-2">Cliente</h2>
            <Link href={`/painel/clientes/${p.cliente.id}`} className="font-semibold text-marrom-950 underline underline-offset-4">{p.nomeCliente}</Link>
            <span>{p.telefoneCliente}</span>
            {(p.cliente.endereco || p.cliente.cidade) && <span className="text-suave">{[p.cliente.endereco, p.cliente.cidade].filter(Boolean).join(' · ')}</span>}
            {p.cep && <span>CEP de entrega: <strong>{p.cep}</strong></span>}
            <span className="text-suave">Vendedor: {p.vendedor.name}</span>
          </Cartao>
          {p.status === 'pendente' && (
            <Cartao className="p-5 sm:p-6">
              <FecharPedido pedidoId={p.id} codigo={p.codigo} condicional={cond}
                itens={p.itens.map(i => ({ id: i.id, nome: i.nome, tamanho: i.tamanho, quantidade: i.quantidade, preco: Number(i.precoUnitario) }))} />
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
