import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { PecasDoPedido } from '@/components/painel/editar-pedido';
import { FecharPedido } from '@/components/painel/fechar-pedido';
import { HistoricoPedido } from '@/components/painel/historico-pedido';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp, mensagemContato } from '@/lib/whatsapp';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { coresDosModelos, pedidoParaEquipe } from '@/server/consultas/pedidos';
import { diasAte, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { lerConfig } from '@/server/config';
import { expiraEm } from '@/server/expiracao';

export default async function DetalhePedido({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const p = await pedidoParaEquipe(u, (await params).id);
  if (!p) notFound();
  const cond = p.tipo === 'condicional';
  const v = valoresDoPedido(p);
  const fim = expiraEm(p.criadoEm, (await lerConfig()).diasExpiracao);
  const chaveItens = p.itens.map(i => `${i.id}:${i.varianteId}:${i.quantidade}:${i.precoUnitario}`).join();
  const cores = p.status === 'pendente' ? await coresDosModelos(p.itens.map(i => i.produtoId)) : {};
  // Desconto dado nesta venda: diferença para o preço do catálogo das peças que contam no total (no condicional fechado, só as que ficaram).
  const desconto = Math.round(p.itens
    .filter(i => (cond && p.status === 'confirmado' ? i.situacao === 'vendido' : i.situacao !== 'devolvido'))
    .reduce((a, i) => a + Math.max(0, Number(i.precoTabela ?? i.precoUnitario) - Number(i.precoUnitario)) * i.quantidade, 0) * 100) / 100;
  const totais = (
    <>
          <div className="border-t border-borda pt-4 grid gap-1">
            {(desconto > 0 || v.frete != null || v.freteACombinar) && (
              <div className="flex justify-between text-sm"><span>Peças{desconto > 0 ? ' (preço do catálogo)' : ''}</span><span>{brl(v.pecas + desconto)}</span></div>
            )}
            {desconto > 0 && <div className="flex justify-between text-sm text-oliva"><span>Desconto</span><span>−{brl(desconto)}</span></div>}
            {(v.frete != null || v.freteACombinar) && (
              <div className="flex justify-between text-sm"><span>Frete</span><span>{v.freteACombinar ? 'a combinar' : v.frete ? brl(v.frete) : 'grátis'}</span></div>
            )}
            <div className="flex justify-between font-display font-extrabold text-lg">
              <span>{v.ficaram != null ? 'Ficou com a cliente' : 'Total do pedido'}</span><span>{brl(v.total)}</span>
            </div>
          </div>
    </>
  );
  const pecas = (
    <>
          <ul className="divide-y divide-borda">
            {p.itens.map(i => (
              <li key={i.id} className={`py-4 grid grid-cols-[64px_1fr_auto] gap-4 items-start ${i.situacao === 'devolvido' ? 'opacity-50' : ''}`}>
                <div className="relative aspect-[3/4] bg-bege"><Foto src={i.imagem} alt={i.nome} sizes="64px" /></div>
                <div className="text-sm">
                  {p.produtosAtivos.has(i.produtoId) ? <Link href={`/produto/${i.referencia}`} className="text-marrom-950 font-semibold hover:underline">{i.nome}</Link> : u.papel === 'gestor' ? <Link href={`/painel/produtos/${i.produtoId}`} className="text-marrom-950 font-semibold hover:underline" title="Produto fora do catálogo">{i.nome}</Link> : <span className="text-marrom-950 font-semibold">{i.nome}</span>}
                  <div className="text-suave">{i.marca} · Ref. {i.referencia}{i.cor ? ` · ${i.cor}` : ''}</div>
                  <div className="mt-1 flex flex-wrap gap-2 items-center">
                    <Etiqueta cor="escuro">Tam. {i.tamanho}</Etiqueta>
                    {i.codigoInterno && <Etiqueta>Cód. {i.codigoInterno}</Etiqueta>}
                    {i.situacao === 'vendido' && cond && <Etiqueta cor="oliva">Ficou</Etiqueta>}
                    {i.situacao === 'devolvido' && <Etiqueta cor="cinza">Voltou</Etiqueta>}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div>{i.quantidade} x {i.precoTabela && i.precoTabela.gt(i.precoUnitario) && <s className="text-suave mr-1">{brl(i.precoTabela)}</s>}{brl(i.precoUnitario)}</div>
                  <div className="font-display font-extrabold">{brl(i.precoUnitario.mul(i.quantidade))}</div>
                </div>
              </li>
            ))}
          </ul>
    </>
  );

  return (
    <>
      <Link href="/painel/pedidos" className="rotulo text-suave hover:text-marrom-950">← Pedidos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={p.origem === 'vendedor' ? 'Seleção do vendedor' : p.origem === 'balcao' ? 'Venda na loja' : 'Loja online'} titulo={p.codigo}
        acoes={p.telefoneCliente ? <a href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener" className={botao('oliva')}>WhatsApp do cliente</a> : undefined}>
        <span className="inline-flex gap-2 flex-wrap items-center"><EtiquetaTipo tipo={p.tipo} /> <EtiquetaStatus status={p.status} /> {formatarDataHora(p.criadoEm)}
          {p.status === 'cancelado' && textoCancelamento(p.motivoCancelamento, false) && <span className="text-suave">· {textoCancelamento(p.motivoCancelamento, false)}{p.canceladoEm ? ` em ${formatarDataHora(p.canceladoEm)}` : ''}</span>}
          {p.status === 'pendente' && fim && <span className={diasAte(fim) <= 2 ? 'text-vermelho' : 'text-suave'}>· Expira em {formatarDataHora(fim)}</span>}
        </span>
      </CabecalhoPagina>

      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6">
        <div className="grid gap-6 content-start">
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Peças</h2>
            {p.status === 'pendente' ? (
              <PecasDoPedido pedidoId={p.id} cores={cores} itens={p.itens.map(i => ({
                id: i.id, varianteId: i.varianteId, produtoId: i.produtoId, referencia: i.referencia, nome: i.nome, marca: i.marca, cor: i.cor, imagem: i.imagem,
                tamanho: i.tamanho, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: Number(i.precoUnitario),
                precoTabela: i.precoTabela == null ? null : Number(i.precoTabela),
                linkProduto: p.produtosAtivos.has(i.produtoId) ? `/produto/${i.referencia}` : u.papel === 'gestor' ? `/painel/produtos/${i.produtoId}` : null,
              }))} />
            ) : pecas}
            {totais}
            {p.venda && <p className="mt-2 text-sm text-oliva">Venda registrada: {brl(p.venda.valor)} em {formatarDataHora(p.venda.data)}.</p>}
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Histórico</h2>
            <HistoricoPedido historico={p.historico} nomeCliente={p.nomeCliente} />
          </Cartao>
        </div>

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
              <FecharPedido key={chaveItens} pedidoId={p.id} codigo={p.codigo} condicional={cond}
                itens={p.itens.map(i => ({ id: i.id, nome: i.nome, tamanho: i.tamanho, quantidade: i.quantidade, preco: Number(i.precoUnitario) }))} />
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
