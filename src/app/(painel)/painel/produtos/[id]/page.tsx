import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormProduto } from '@/components/painel/form-produto';
import { TamanhosRapidos } from '@/components/painel/produto/tamanhos-rapidos';
import type { AvisoExterno } from '@/components/painel/produto/acompanhamento';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { IconeAtividade, IconeCaixa, IconeExterno, IconeImagem, IconeLixo, IconeRegua, IconeRelogio, IconeVoltar } from '@/components/ui/icones';
import { formatarDataHora } from '@/lib/datas';
import { posicaoTamanho } from '@/lib/catalogo';
import { adicionarVariante, ajustarEstoque, excluirProduto, removerVariante } from '@/server/acoes/produtos';
import { exigirPapel } from '@/server/permissoes';
import { produtoParaEdicao } from '@/server/consultas/produtos';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { botao } from '@/components/ui/botao';

const MOTIVOS = { entrada: 'Entrada', ajuste: 'Ajuste', venda: 'Venda', estorno: 'Venda desfeita' } as const;

export default async function EditarProduto({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(['gestor']);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const r = await produtoParaEdicao(u, id);
  if (!r) notFound();
  const { produto: p, marcas, categorias, movimentos } = r;
  const variantes = [...p.variantes].sort((a, b) => posicaoTamanho(a.tamanho) - posicaoTamanho(b.tamanho));
  const tamanhoDe = new Map(variantes.map(v => [v.id, v.tamanho]));
  const total = variantes.reduce((a, v) => a + v.estoque, 0);
  const reservado = variantes.reduce((a, v) => a + v.reservado, 0);
  const maior = Math.max(1, ...variantes.map(v => v.estoque));

  const avisos: AvisoExterno[] = variantes.length === 0
    ? [{ tipo: 'alerta', texto: <><strong>Sem tamanhos.</strong> A peça aparece esgotada até você <a href="#estoque" className="underline">adicionar tamanhos e estoque</a>.</> }]
    : total === 0 ? [{ tipo: 'alerta', texto: <><strong>Estoque zerado</strong> em todos os tamanhos: aparece como esgotado.</> }]
      : variantes.some(v => v.estoque > 0 && v.estoque <= 1) ? [{ tipo: 'info', texto: <>Última peça em {variantes.filter(v => v.estoque === 1).map(v => v.tamanho).join(', ')}.</> }] : [];

  return (
    <>
      <Link href="/painel/produtos" className="inline-flex items-center gap-1 text-sm text-suave hover:text-marrom-950"><IconeVoltar className="size-4" />Produtos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={p.referencia} titulo={p.nome}
        acoes={<>
          <Link href={`/painel/produtos/${p.id}/midia`} className={botao('secundario', 'p')}><IconeImagem className="size-4" />Só fotos e vídeos</Link>
          {p.ativo && <Link href={`/produto/${p.referencia}`} target="_blank" className={botao('primario', 'p')}><IconeExterno className="size-4" />Ver na loja</Link>}
        </>}>
        <span className="flex flex-wrap items-center gap-2 mt-1">
          {p.ativo ? <Etiqueta cor="oliva">Ativo</Etiqueta> : <Etiqueta cor="cinza">Oculto</Etiqueta>}
          {p.imperdivel && <Etiqueta cor="imperdivel">Imperdível</Etiqueta>}
          <span className="inline-flex items-center gap-1 text-xs"><IconeRelogio className="size-3.5" />Atualizado em {formatarDataHora(p.atualizadoEm)}</span>
        </span>
      </CabecalhoPagina>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Indicador icone={<IconeCaixa className="size-5" />} rotulo="Em estoque" valor={total} alerta={total === 0} />
        <Indicador icone={<IconeRegua className="size-5" />} rotulo="Tamanhos" valor={variantes.length} />
        <Indicador icone={<IconeRelogio className="size-5" />} rotulo="Reservadas" valor={reservado} />
        <Indicador icone={<IconeImagem className="size-5" />} rotulo="Fotos · vídeos" valor={`${p.imagens.length} · ${p.videos.length}`} alerta={p.imagens.length === 0} />
      </div>

      <FormProduto produto={p} marcas={marcas} categorias={categorias} avisos={avisos} />

      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start mt-10">
        <Cartao className="p-5 sm:p-7 scroll-mt-24 sombra-suave">
          <div id="estoque" className="flex items-start gap-4 mb-5 scroll-mt-24">
            <span className="grid place-items-center size-11 shrink-0 rounded-2xl bg-bege text-caramelo"><IconeRegua /></span>
            <div>
              <h2 className="titulo text-xl leading-tight">Tamanhos e estoque</h2>
              <p className="text-sm text-suave mt-0.5">Cada tamanho tem seu estoque. Toda entrada e contagem fica no histórico.</p>
            </div>
          </div>

          {variantes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-borda-forte p-6 text-center text-sm text-suave mb-6">Nenhum tamanho cadastrado. Comece pelos atalhos abaixo.</div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {variantes.map(v => {
                const tom = v.estoque === 0 ? 'var(--color-vermelho)' : v.estoque <= 2 ? 'var(--color-caramelo)' : 'var(--color-oliva)';
                return (
                  <li key={v.id} className="rounded-2xl border border-borda bg-creme/50 p-4 grid gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid place-items-center min-w-11 h-11 px-2 rounded-xl bg-card border border-borda font-display font-extrabold text-lg text-marrom-950">{v.tamanho}</span>
                      {v._count.itens === 0 && v.reservado === 0 && (
                        <BotaoAcao acao={removerVariante.bind(null, v.id)} confirmar={`Remover o tamanho ${v.tamanho}?`} className="grid place-items-center size-8 rounded-full text-suave hover:text-vermelho hover:bg-vermelho/10" >
                          <IconeLixo className="size-4" /><span className="sr-only">Remover o tamanho {v.tamanho}</span>
                        </BotaoAcao>
                      )}
                    </div>
                    <div>
                      <span className="text-2xl font-extrabold tabular-nums" style={{ color: tom }}>{v.estoque}</span>
                      <span className="text-xs text-suave ml-1">{v.estoque === 1 ? 'peça' : 'peças'}{v.reservado ? ` · ${v.reservado} reserv.` : ''}</span>
                    </div>
                    <span className="block h-1.5 rounded-full bg-borda overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(v.estoque / maior) * 100}%`, background: tom }} /></span>
                    <span className="text-[0.7rem] text-suave truncate">Cód. {v.codigoInterno ?? '—'}{v.ean ? ` · EAN ${v.ean}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {variantes.length > 0 && (
              <Formulario acao={ajustarEstoque} limparAoConcluir className="grid sm:grid-cols-2 gap-3 content-start rounded-2xl border border-borda p-4 sm:p-5">
                <h3 className="sm:col-span-2 rotulo text-caramelo">Movimentar estoque</h3>
                <Campo nome="varianteId" rotulo="Tamanho" tipo="select" opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...variantes.map(v => ({ valor: String(v.id), rotulo: `${v.tamanho} (${v.estoque})` }))]} />
                <Campo nome="tipo" rotulo="Tipo" tipo="select" opcoes={[{ valor: 'entrada', rotulo: 'Entrada (somar)' }, { valor: 'ajuste', rotulo: 'Ajuste (quantidade contada)' }]} />
                <Campo nome="quantidade" rotulo="Quantidade" tipo="number" />
                <Campo nome="observacao" rotulo="Observação" placeholder="Nota fiscal, contagem…" />
                <div className="sm:col-span-2"><BotaoEnviar>Registrar</BotaoEnviar></div>
              </Formulario>
            )}
            <Formulario acao={adicionarVariante} limparAoConcluir prefixo="tam-" className="grid sm:grid-cols-2 gap-3 content-start rounded-2xl border border-borda p-4 sm:p-5">
              <h3 className="sm:col-span-2 rotulo text-caramelo">Adicionar tamanho</h3>
              <input type="hidden" name="produtoId" value={p.id} />
              <TamanhosRapidos existentes={variantes.map(v => v.tamanho)} />
              <Campo nome="tamanho" rotulo="Tamanho" placeholder="M" />
              <Campo nome="estoque" rotulo="Estoque inicial" tipo="number" padrao={0} />
              <Campo nome="codigoInterno" rotulo="Código interno" />
              <Campo nome="ean" rotulo="EAN" ajuda="Só números (código de barras)." />
              <div className="sm:col-span-2"><BotaoEnviar variante="secundario">Adicionar</BotaoEnviar></div>
            </Formulario>
          </div>
        </Cartao>

        <div className="grid gap-6">
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4 flex items-center gap-2"><IconeAtividade className="size-5 text-caramelo" />Histórico de estoque</h2>
            {movimentos.length === 0 ? <p className="text-sm text-suave">Sem movimentações.</p> : (
              <ul className="divide-y divide-borda text-sm max-h-[28rem] overflow-y-auto -mr-2 pr-2">
                {movimentos.map(m => (
                  <li key={m.id} className="py-2.5 flex justify-between gap-3">
                    <span className="flex gap-2.5">
                      <span aria-hidden="true" className={`mt-0.5 grid place-items-center h-6 min-w-9 px-1.5 rounded-full text-xs font-bold tabular-nums ${m.delta > 0 ? 'bg-oliva/10 text-oliva' : 'bg-vermelho/10 text-vermelho'}`}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                      <span>
                        <span className="sr-only">{m.delta > 0 ? '+' : ''}{m.delta} · </span>Tam. {tamanhoDe.get(m.varianteId)} · {MOTIVOS[m.motivo]}
                        {m.observacao && <span className="text-suave"> · {m.observacao}</span>}
                      </span>
                    </span>
                    <span className="text-suave text-xs text-right whitespace-nowrap">{formatarDataHora(m.criadoEm)}{m.usuario && <><br />{m.usuario.name.split(' ')[0]}</>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao className="p-5 sm:p-6 !border-vermelho/30">
            <h2 className="titulo text-lg mb-2 flex items-center gap-2 text-vermelho"><IconeLixo className="size-5" />Excluir produto</h2>
            <p className="text-sm text-suave mb-4">Apaga o produto com fotos, tamanhos, custo e histórico de estoque. Produto que já entrou em pedido não pode ser excluído: desmarque &quot;Ativo no catálogo&quot;.</p>
            <BotaoAcao acao={excluirProduto.bind(null, p.id)} confirmar={`Excluir ${p.referencia} definitivamente? Não dá para desfazer.`} depois="/painel/produtos" className={botao('perigo')}>Excluir produto</BotaoAcao>
          </Cartao>
        </div>
      </div>
    </>
  );
}

function Indicador({ icone, rotulo, valor, alerta }: { icone: React.ReactNode; rotulo: string; valor: React.ReactNode; alerta?: boolean }) {
  return (
    <div className={`kpi flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 ${alerta ? 'bg-vermelho/5 border-vermelho/30' : 'bg-card border-borda'}`}>
      <span className={`grid place-items-center size-10 rounded-xl ${alerta ? 'bg-vermelho/10 text-vermelho' : 'bg-bege text-caramelo'}`}>{icone}</span>
      <span>
        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-suave">{rotulo}</span>
        <span className={`block text-xl font-extrabold tabular-nums ${alerta ? 'text-vermelho' : 'text-marrom-950'}`}>{valor}</span>
      </span>
    </div>
  );
}
