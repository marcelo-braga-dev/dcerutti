import Link from 'next/link';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { SITUACOES_ENTREGA, SITUACOES_PAGAMENTO } from '@/lib/pos-venda';
import { salvarSituacaoDoPedido } from '@/server/acoes/pos-venda';
import { descreverPagamento } from '@/lib/caixa';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { PecasDoPedido, type CupomDoPedido } from '@/components/painel/editar-pedido';
import { cuponsDaFicha, cuponsParaDivulgar, nomesDosAlvos, regraDe } from '@/server/consultas/cupons';
import { CancelarVenda, FecharPedido } from '@/components/painel/fechar-pedido';
import { HistoricoPedido } from '@/components/painel/historico-pedido';
import { CartaoSecao, Etiqueta } from '@/components/ui/basicos';
import { IconeAlerta, IconeAtividade, IconeCaixa, IconeCaixaLoja, IconeCalendario, IconeCaminhao, IconeCartao, IconeCheck, IconeDesfazer, IconeEtiqueta, IconeFechar, IconeLoja, IconeMapa, IconePessoa, IconeRelogio, IconeSacola, IconeTelefone, IconeVoltar } from '@/components/ui/icones';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import type { ReactNode } from 'react';
import { botao } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp, mensagemContato, mensagemCupomProximaCompra } from '@/lib/whatsapp';
import { urlDoSite } from '@/server/site';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { coresDosModelos, pedidoParaEquipe } from '@/server/consultas/pedidos';
import { diasAte, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { beneficio, regraEmPalavras } from '@/lib/cupom';
import { lerConfig } from '@/server/config';
import { expiraEm, prazoVencido } from '@/server/expiracao';
import { PagamentoPedido } from '@/components/painel/pagamento-pedido';
import { pagamentoDoPedido } from '@/server/consultas/pagamentos';
import { talvezConciliar } from '@/server/pagamentos/cobrancas';
import { after } from 'next/server';

export default async function DetalhePedido({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const p = await pedidoParaEquipe(u, (await params).id);
  if (!p) notFound();
  const cond = p.tipo === 'condicional';
  const v = valoresDoPedido(p);
  const motivoCancelamento = p.historico.find(h => h.acao === 'cancelado')?.observacao;
  const [cfg, site, pgto] = await Promise.all([lerConfig(), urlDoSite(), pagamentoDoPedido(u, p.id)]);
  // Pagamento online (docs/27): o quadro aparece com a chave ligada, ou quando o pedido já tem cobranças.
  if (pgto?.ativa) after(() => talvezConciliar());
  const mostrarPagamento = !!pgto && p.origem !== 'balcao' && (pgto.cfg.ligado || pgto.cobrancas.length > 0);
  const fim = expiraEm(p.criadoEm, cfg.diasExpiracao);
  const vencido = prazoVencido(p, cfg.diasExpiracao);
  const chaveItens = p.itens.map(i => `${i.id}:${i.varianteId}:${i.quantidade}:${i.precoUnitario}`).join();
  const cores = p.status === 'pendente' ? await coresDosModelos(p.itens.map(i => i.produtoId)) : {};
  // Fase 3 dos cupons: o atual, os que a equipe pode aplicar a esta cliente e se pode aplicar agora.
  const podeAplicarCupom = cfg.cupons.ligados && (u.papel === 'gestor' || cfg.cupons.vendedorAplica);
  const cupom: CupomDoPedido | undefined = p.status !== 'pendente' ? undefined : {
    podeAplicar: podeAplicarCupom,
    atual: p.codigoCupom ? {
      codigo: p.codigoCupom, desconto: Number(p.descontoCupom), freteGratis: p.freteCupom,
      beneficio: p.cupom ? beneficio({ tipo: p.cupom.tipo, valor: p.cupom.valor == null ? null : Number(p.cupom.valor), tetoDesconto: p.cupom.tetoDesconto == null ? null : Number(p.cupom.tetoDesconto) }) : '',
    } : null,
    // Os da loja que a equipe aplica e os da própria cliente (primeira compra, próxima compra), sem repetir.
    disponiveis: !podeAplicarCupom ? [] : [
      ...(await cuponsDaFicha(p.clienteId)).filter(c => c.situacao === 'disponivel' && c.quemAplica !== 'cliente').map(c => ({ codigo: c.codigo, regra: c.regra })),
      ...(await cuponsParaDivulgar(u))
        .filter(c => c.quemAplica !== 'cliente' && (!c.especifico || c.clientes.some(x => x.id === p.clienteId)) && c.situacao === 'ativo')
        .map(c => ({ codigo: c.codigo, regra: regraEmPalavras(c.regra, c.nomes) })),
    ].filter((c, i, l) => l.findIndex(x => x.codigo === c.codigo) === i),
  };
  // Desconto dado nesta venda: diferença para o preço do catálogo das peças que contam no total (no condicional fechado, só as que ficaram).
  const desconto = Math.round(p.itens
    .filter(i => (cond && p.status === 'confirmado' ? i.situacao === 'vendido' : i.situacao !== 'devolvido'))
    .reduce((a, i) => a + Math.max(0, Number(i.precoTabela ?? i.precoUnitario) - Number(i.precoUnitario)) * i.quantidade, 0) * 100) / 100;
  const totais = (
    <>
          <div className="border-t border-borda mt-1 pt-3 grid gap-1">
            {(desconto > 0 || v.codigoCupom || v.frete != null || v.freteACombinar) && (
              <div className="flex justify-between text-sm"><span>Peças{desconto > 0 ? ' (preço do catálogo)' : ''}</span><span>{brl(v.pecas + desconto)}</span></div>
            )}
            {desconto > 0 && <div className="flex justify-between text-sm text-oliva"><span>{v.codigoCupom ? 'Desconto do vendedor' : 'Desconto'}</span><span>−{brl(desconto)}</span></div>}
            {v.codigoCupom && (
              <div className="flex justify-between gap-3 text-sm text-oliva">
                <span>
                  Cupom <strong className="font-display tracking-wide">{v.codigoCupom}</strong>
                  {p.cupom && <span className="text-suave"> · {beneficio({ tipo: p.cupom.tipo, valor: p.cupom.valor == null ? null : Number(p.cupom.valor), tetoDesconto: p.cupom.tetoDesconto == null ? null : Number(p.cupom.tetoDesconto) })}{p.cupom.descricao ? ` · ${p.cupom.descricao}` : ''}</span>}
                </span>
                <span className="whitespace-nowrap">{v.freteCupom ? 'frete grátis' : `−${brl(v.cupom)}`}</span>
              </div>
            )}
            {(v.frete != null || v.freteACombinar) && (
              <div className="flex justify-between text-sm"><span>Frete</span><span>{v.freteACombinar ? 'a combinar' : v.frete ? brl(v.frete) : v.freteCupom ? 'grátis (cupom)' : 'grátis'}</span></div>
            )}
            <div className="flex justify-between items-baseline font-display font-extrabold text-lg pt-1">
              <span>{v.ficaram != null ? 'Ficou com a cliente' : 'Total do pedido'}</span><span>{brl(v.total)}</span>
            </div>
          </div>
    </>
  );
  const pecas = (
    <>
          <ul className="divide-y divide-borda -mt-2">
            {p.itens.map(i => (
              <li key={i.id} className={`py-3 grid grid-cols-[48px_1fr_auto] gap-3 items-start ${i.situacao === 'devolvido' ? 'opacity-50' : ''}`}>
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-bege"><Foto src={i.imagem} alt={i.nome} sizes="48px" /></div>
                <div className="text-sm">
                  {p.produtosAtivos.has(i.produtoId) ? <Link href={`/produto/${i.referencia}`} className="text-marrom-950 font-semibold hover:underline">{i.nome}</Link> : u.papel === 'gestor' ? <Link href={`/painel/produtos/${i.produtoId}`} className="text-marrom-950 font-semibold hover:underline" title="Produto fora do catálogo">{i.nome}</Link> : <span className="text-marrom-950 font-semibold">{i.nome}</span>}
                  <div className="text-suave">{i.marca} · Ref. {i.referencia}{i.cor ? ` · ${i.cor}` : ''}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 items-center">
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

  const unidades = p.itens.filter(i => i.situacao !== 'devolvido').reduce((a, i) => a + i.quantidade, 0);
  const OrigemIcone = p.origem === 'balcao' ? IconeCaixaLoja : p.origem === 'vendedor' ? IconePessoa : IconeLoja;
  const cancelado = p.status === 'cancelado';
  // Linha do tempo da situação: recebido → pagamento → venda → entrega (no balcão a venda já nasce paga e entregue).
  const passos: { titulo: string; detalhe: string; feito: boolean; icone: ReactNode }[] = [
    { titulo: p.origem === 'balcao' ? 'Venda na loja' : 'Recebido', detalhe: formatarDataHora(p.criadoEm), feito: true, icone: <IconeSacola className="size-4" /> },
    ...(p.origem === 'balcao' ? [] : [{ titulo: 'Pagamento', detalhe: SITUACOES_PAGAMENTO[p.pagamentoSituacao] ?? '—', feito: p.pagamentoSituacao === 'pago', icone: <IconeCartao className="size-4" /> }]),
    { titulo: cond ? 'Condicional fechado' : 'Venda confirmada', detalhe: p.status === 'confirmado' ? (p.venda ? formatarData(p.venda.data) : 'feito') : cancelado ? '—' : vencido ? 'prazo vencido' : 'aguardando', feito: p.status === 'confirmado', icone: <IconeCheck className="size-4" /> },
    ...(p.origem === 'balcao' ? [] : [{ titulo: 'Entrega', detalhe: SITUACOES_ENTREGA[p.entregaSituacao] ?? '—', feito: p.entregaSituacao === 'entregue', icone: <IconeCaminhao className="size-4" /> }]),
  ];
  const atual = passos.findIndex(x => !x.feito);

  return (
    <>
      <Link href="/painel/pedidos" className="inline-flex items-center gap-1 text-sm text-suave hover:text-marrom-950"><IconeVoltar className="size-4" />Pedidos</Link>

      {/* Cabeçalho: código, selos e o contato com a cliente. */}
      <div className="mt-3 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-caramelo font-semibold uppercase tracking-[0.1em] mb-1"><OrigemIcone className="size-4" />{p.origem === 'vendedor' ? 'Seleção do vendedor' : p.origem === 'balcao' ? 'Venda na loja' : 'Loja online'}</div>
          <h1 className="titulo text-2xl sm:text-3xl">{p.codigo}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-suave">
            <EtiquetaTipo tipo={p.tipo} /> <EtiquetaStatus status={p.status} />
            <span className="inline-flex items-center gap-1"><IconeCalendario className="size-3.5" />{formatarDataHora(p.criadoEm)}</span>
            <span>· {unidades} {unidades === 1 ? 'peça' : 'peças'} · <strong className="text-marrom-950">{brl(v.total)}</strong></span>
            {p.status === 'pendente' && fim && !vencido && (
              <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-semibold ${diasAte(fim) <= 2 ? 'bg-vermelho/10 text-vermelho' : 'bg-creme text-suave'}`}><IconeRelogio className="size-3.5" />Responder até {formatarDataHora(fim)}</span>
            )}
          </div>
          {cancelado && textoCancelamento(p.motivoCancelamento, false) && (
            <p className="mt-1.5 text-sm text-suave">{textoCancelamento(p.motivoCancelamento, false)}{p.canceladoEm ? ` em ${formatarDataHora(p.canceladoEm)}` : ''}{motivoCancelamento ? `: “${motivoCancelamento}”` : ''}</p>
          )}
        </div>
        {p.telefoneCliente && (
          <a data-acao="contato" data-pedido={p.id} href={linkWhatsApp(p.telefoneCliente, mensagemContato(p.nomeCliente, p.tipo, p.codigo))} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>
            <IconeWhatsApp className="size-4" />WhatsApp do cliente
          </a>
        )}
      </div>

      {/* Linha do tempo da situação. */}
      <ol className={`mb-4 grid gap-3 rounded-[1.25rem] border border-borda bg-card px-4 py-3 overflow-x-auto sem-barra ${cancelado ? 'opacity-80' : ''}`} style={{ gridTemplateColumns: `repeat(${passos.length + (cancelado ? 1 : 0)}, minmax(8.5rem, 1fr))` }} aria-label="Situação do pedido">
        {passos.map((x, i) => {
          const agora = !cancelado && i === atual;
          return (
            <li key={x.titulo} className="flex items-center gap-2 min-w-0">
              <span className={`grid place-items-center size-8 shrink-0 rounded-full ${x.feito ? 'bg-oliva text-creme' : agora ? (vencido ? 'bg-vermelho text-white' : 'bg-marrom-950 text-creme') : 'bg-creme text-suave border border-borda-forte'}`}>{x.feito ? <IconeCheck className="size-4" /> : x.icone}</span>
              <span className="min-w-0">
                <span className={`block text-[0.8rem] font-semibold leading-tight truncate ${x.feito || agora ? 'text-marrom-950' : 'text-suave'}`}>{x.titulo}</span>
                <span className={`block text-[0.7rem] truncate ${agora && vencido ? 'text-vermelho font-semibold' : 'text-suave'}`}>{x.detalhe}</span>
              </span>
            </li>
          );
        })}
        {cancelado && (
          <li className="flex items-center gap-2 min-w-0">
            <span className="grid place-items-center size-8 shrink-0 rounded-full bg-vermelho text-white"><IconeFechar className="size-4" /></span>
            <span className="min-w-0"><span className="block text-[0.8rem] font-semibold text-vermelho leading-tight">Cancelamento</span><span className="block text-[0.7rem] text-suave truncate">{p.canceladoEm ? formatarDataHora(p.canceladoEm) : '—'}</span></span>
          </li>
        )}
      </ol>

      {vencido && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-vermelho/30 bg-vermelho/5 px-4 py-2.5 text-sm" role="status">
          <IconeAlerta className="size-4 mt-0.5 shrink-0 text-vermelho" />
          <span>O prazo de resposta venceu{fim ? ` em ${formatarDataHora(fim)}` : ''}. Não cancela sozinho: confirme ou use <strong>Cancelar pedido</strong>{cond ? ' (a reserva volta ao estoque)' : ''}.</span>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="grid gap-4 min-w-0">
          <CartaoSecao icone={<IconeCaixa />} titulo="Peças" extra={<span className="text-xs">{unidades} {unidades === 1 ? 'peça' : 'peças'}</span>}>
            {p.status === 'pendente' ? (
              <PecasDoPedido pedidoId={p.id} cores={cores} cupom={cupom} itens={p.itens.map(i => ({
                id: i.id, varianteId: i.varianteId, produtoId: i.produtoId, referencia: i.referencia, nome: i.nome, marca: i.marca, cor: i.cor, imagem: i.imagem,
                tamanho: i.tamanho, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: Number(i.precoUnitario),
                precoTabela: i.precoTabela == null ? null : Number(i.precoTabela),
                linkProduto: p.produtosAtivos.has(i.produtoId) ? `/produto/${i.referencia}` : u.papel === 'gestor' ? `/painel/produtos/${i.produtoId}` : null,
              }))} />
            ) : pecas}
            {totais}
            {p.venda && <p className="mt-2 flex items-center gap-1.5 text-sm text-oliva"><IconeCheck className="size-4" />Venda registrada: {brl(p.venda.valor)} em {formatarDataHora(p.venda.data)}.</p>}
            {p.cupomGerado && (() => {
              const g = p.cupomGerado;
              const regra = regraEmPalavras(regraDe(g), nomesDosAlvos(g));
              const texto = mensagemCupomProximaCompra({
                nomeCliente: p.nomeCliente, nomeVendedor: u.papel === 'vendedor' ? u.name : p.vendedor.name, codigo: g.codigo, regra,
                inicio: formatarData(g.inicioEm), fim: g.fimEm ? formatarData(g.fimEm) : 'sem data', link: g.quemAplica === 'equipe' ? null : `${site}/sacola?cupom=${g.codigo}`,
              });
              return (
                <div className="mt-3 rounded-xl border border-dashed border-oliva bg-oliva/5 p-3 flex flex-wrap items-center gap-3 text-sm">
                  <IconeEtiqueta className="size-5 text-oliva shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-oliva">Cupom de próxima compra gerado</div>
                    <div><strong className="font-display tracking-wide text-marrom-950">{g.codigo}</strong> <span className="text-suave">· {regra} · vale de {formatarData(g.inicioEm)}{g.fimEm ? ` a ${formatarData(g.fimEm)}` : ''}</span></div>
                  </div>
                  {p.telefoneCliente && <a href={linkWhatsApp(p.telefoneCliente, texto)} data-acao="cupom" data-pedido={p.id} target="_blank" rel="noopener" className={botao('oliva', 'p')}><IconeWhatsApp className="size-3.5" />Enviar o cupom pelo WhatsApp</a>}
                </div>
              );
            })()}
          </CartaoSecao>
          <CartaoSecao icone={<IconeAtividade />} titulo="Histórico">
            <HistoricoPedido historico={p.historico} nomeCliente={p.nomeCliente} />
          </CartaoSecao>
        </div>

        <div className="grid gap-4 min-w-0 xl:sticky xl:top-4">
          {p.status === 'pendente' && (
            <CartaoSecao tom="destaque" icone={<IconeCheck />} titulo={cond ? 'Fechar o condicional' : 'Próximo passo'}>
              <FecharPedido key={`${chaveItens}:${p.codigoCupom}:${p.descontoCupom}`} pedidoId={p.id} codigo={p.codigo} condicional={cond} vencido={vencido}
                cupom={p.codigoCupom ? { codigo: p.codigoCupom, desconto: Number(p.descontoCupom) } : null}
                itens={p.itens.map(i => ({ id: i.id, nome: i.nome, tamanho: i.tamanho, quantidade: i.quantidade, preco: Number(i.precoUnitario), imagem: i.imagem }))} />
            </CartaoSecao>
          )}
          <CartaoSecao icone={<IconePessoa />} titulo="Cliente">
            <div className="flex items-start gap-3 text-sm">
              <span className="grid place-items-center size-10 shrink-0 rounded-full bg-marrom-950 text-creme font-bold">{p.nomeCliente.trim()[0]?.toUpperCase()}</span>
              <div className="min-w-0 grid gap-1">
                <Link href={`/painel/clientes/${p.cliente.id}`} className="font-semibold text-marrom-950 underline underline-offset-4 truncate">{p.nomeCliente}</Link>
                {p.telefoneCliente && <span className="inline-flex items-center gap-1.5 text-suave"><IconeTelefone className="size-3.5" /><span className="tabular-nums text-marrom-950">{p.telefoneCliente}</span></span>}
                {(p.cliente.endereco || p.cliente.cidade) && <span className="inline-flex items-start gap-1.5 text-suave"><IconeMapa className="size-3.5 mt-0.5 shrink-0" />{[p.cliente.endereco, p.cliente.cidade].filter(Boolean).join(' · ')}</span>}
                {p.cep && <span className="text-suave">CEP de entrega: <strong className="text-marrom-950">{p.cep}</strong></span>}
                <span className="text-xs text-suave">Vendedor: {p.vendedor.name}</span>
              </div>
            </div>
          </CartaoSecao>
          {mostrarPagamento && pgto && (
            <div className="cartao bg-card border border-borda rounded-[1.25rem] p-5">
              <PagamentoPedido pedidoId={p.id} configurado={pgto.configurado} pix={pgto.cfg.pix} cartao={pgto.cfg.cartao} valor={pgto.valor}
                cobrancas={pgto.cobrancas} podeEstornar={pgto.podeEstornar} podeDefinirFrete={pgto.podeDefinirFrete} frete={pgto.frete} eventos={pgto.eventos} />
            </div>
          )}
          {p.origem !== 'balcao' && !cancelado && (
            <CartaoSecao icone={<IconeCaminhao />} titulo="Pagamento e entrega">
              <p className="text-xs text-suave mb-3">{pgto?.paga ? 'O pagamento online já marcou este pedido como pago.' : 'Para o que foi combinado fora do site. O pagamento online atualiza sozinho.'}</p>
              <Formulario acao={salvarSituacaoDoPedido} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="id" value={p.id} />
                <Campo nome="pagamento" rotulo="Pagamento" tipo="select" padrao={p.pagamentoSituacao} opcoes={Object.entries(SITUACOES_PAGAMENTO).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                <Campo nome="entrega" rotulo="Entrega" tipo="select" padrao={p.entregaSituacao} opcoes={Object.entries(SITUACOES_ENTREGA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
                <div className="col-span-2"><BotaoEnviar variante="secundario" className="!h-9">Salvar</BotaoEnviar></div>
              </Formulario>
            </CartaoSecao>
          )}
          {p.pagamentos.length > 0 && (
            <CartaoSecao icone={<IconeCartao />} titulo={p.origem === 'balcao' ? 'Pagamento no caixa' : 'Pagamentos recebidos'}>
              <div className="grid gap-1.5 text-sm">
                {p.pagamentos.map(g => (
                  <div key={g.id} className="flex justify-between gap-3">
                    <span>{descreverPagamento({ forma: g.forma, valor: Number(g.valor), parcelas: g.parcelas, recebido: g.recebido == null ? null : Number(g.recebido) }, brl)}</span>
                    <span className="font-semibold tabular-nums">{brl(Number(g.valor))}</span>
                  </div>
                ))}
              </div>
            </CartaoSecao>
          )}
          {p.status === 'confirmado' && (
            <CartaoSecao tom="perigo" icone={<IconeDesfazer />} titulo="Desfazer a venda">
              <p className="text-xs text-suave mb-3">Devolução ou venda por engano: as peças voltam ao estoque e a venda sai das metas e relatórios.</p>
              <CancelarVenda pedidoId={p.id} codigo={p.codigo} condicional={cond} />
            </CartaoSecao>
          )}
        </div>
      </div>
    </>
  );
}
