import Link from 'next/link';
import { Foto } from '@/components/loja/foto';
import { Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { duracaoEmPalavras, tempoDesde } from '@/lib/atividade';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import type { interesseDoCliente } from '@/server/consultas/navegacao';

type Interesse = NonNullable<Awaited<ReturnType<typeof interesseDoCliente>>>;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Ficha do cliente: acesso, peças mais vistas, sacola, preferências e buscas (docs/21). */
export function InteresseCliente({ dados: d, temAcesso }: { dados: Interesse; temAcesso: boolean }) {
  const c = d.cliente;
  const r = d.resumo;
  const semNada = !r.ultimoAcessoEm && !d.pecas.length && !d.sacola;
  const historico = `/painel/clientes/${c.id}/historico`;

  return (
    <Cartao className="p-5 sm:p-6 grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="titulo text-lg">Interesse e acesso</h2>
        <Link href={historico} className="rotulo text-caramelo underline underline-offset-4">Histórico completo</Link>
      </div>

      {!temAcesso && !r.ultimoAcessoEm ? (
        <p className="text-sm text-suave">Este cliente ainda não tem acesso à loja. Com o acesso criado, aqui aparecem as peças que ele vê e o que separa na sacola.</p>
      ) : semNada ? (
        <p className="text-sm text-suave">Ainda não há navegação registrada.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Dado rotulo="Último acesso" titulo={r.ultimoAcessoEm ? formatarDataHora(r.ultimoAcessoEm) : undefined}>{tempoDesde(r.ultimoAcessoEm)}</Dado>
            <Dado rotulo="Último login" titulo={r.ultimoLoginEm ? formatarDataHora(r.ultimoLoginEm) : undefined}>{r.ultimoLoginEm ? formatarDataHora(r.ultimoLoginEm) : '—'}</Dado>
            <Dado rotulo="Aparelho">{r.aparelho ? r.aparelho.charAt(0).toUpperCase() + r.aparelho.slice(1) : '—'}</Dado>
            <Dado rotulo="Visitas">{r.visitas7} em 7 dias · {r.visitas30} em 30</Dado>
            <Dado rotulo="Páginas (30 dias)">{r.paginas30}</Dado>
            <Dado rotulo="Tempo na loja (30 dias)">{duracaoEmPalavras(r.tempo30)}</Dado>
          </dl>

          {d.sacola && d.sacola.linhas.length > 0 && (
            <section className="bg-bege p-4 grid gap-3">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="rotulo text-marrom-950">Na sacola agora · {brl(d.sacola.total)}</h3>
                <span className="text-xs text-suave">Mexeu {tempoDesde(d.sacola.atualizadoEm)}{d.sacola.avisadoEm ? ' · aviso enviado' : ''}</span>
              </div>
              <ul className="grid gap-2">
                {d.sacola.linhas.map(l => (
                  <li key={l.varianteId} className="flex gap-3 items-center text-sm">
                    <div className="relative w-9 aspect-[3/4] bg-card shrink-0"><Foto src={l.produto.imagem} alt="" sizes="36px" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-marrom-950 truncate">{l.quantidade}× {l.produto.nome}</div>
                      <div className="text-xs text-suave">Tam. {l.tamanho} · {brl(l.produto.preco)} · {l.disponivel ? `${l.disponivel} em estoque` : 'esgotado'}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href={`/painel/pedidos/novo?cliente=${c.id}&busca=${encodeURIComponent(d.sacola.linhas[0].produto.referencia)}`} className={botao('oliva', 'p', 'justify-self-start')}>Montar pedido</Link>
            </section>
          )}

          {d.pecas.length > 0 && (
            <section>
              <h3 className="rotulo text-marrom-950 mb-3">Peças mais vistas <span className="text-suave">({d.totalPecasVistas})</span></h3>
              <ul className="divide-y divide-borda">
                {d.pecas.map(x => (
                  <li key={x.produto.id} className="py-2 flex gap-3 items-center text-sm">
                    <div className="relative w-10 aspect-[3/4] bg-bege shrink-0"><Foto src={x.produto.imagem} alt="" sizes="40px" /></div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/produto/${x.produto.referencia}`} target="_blank" className="text-marrom-950 hover:underline line-clamp-1">{x.produto.nome}</Link>
                      <div className="text-xs text-suave">
                        {x.vezes}× · {duracaoEmPalavras(x.tempo)} · {tempoDesde(x.ultimaVez)}
                        {x.tamanhos.length > 0 && ` · tam. ${x.tamanhos.join(', ')}`}
                        {` · ${brl(x.produto.preco)}`}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {x.situacao === 'comprou' && <Etiqueta cor="oliva">Comprou</Etiqueta>}
                        {x.situacao === 'pediu' && <Etiqueta cor="caramelo">Pediu</Etiqueta>}
                        {!x.situacao && x.naSacola > 0 && <Etiqueta>Pôs na sacola</Etiqueta>}
                        {!x.produto.ativo ? <Etiqueta cor="cinza">Fora do catálogo</Etiqueta> : !x.produto.disponivel && <Etiqueta cor="cinza">Esgotado</Etiqueta>}
                      </div>
                    </div>
                    {x.produto.ativo && x.produto.disponivel > 0 && !x.situacao && (
                      <Link href={`/painel/pedidos/novo?cliente=${c.id}&busca=${encodeURIComponent(x.produto.referencia)}`} className="rotulo !text-[0.62rem] text-caramelo underline underline-offset-4 shrink-0">Oferecer</Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.preferencias.categorias.length > 0 || d.preferencias.tamanhos.length > 0) && (
            <section className="grid sm:grid-cols-2 gap-4 text-sm">
              <Ranking titulo="Categorias que mais vê" itens={d.preferencias.categorias} />
              <Ranking titulo="Marcas" itens={d.preferencias.marcas} />
              <Ranking titulo="Tamanhos que escolhe" itens={d.preferencias.tamanhos} />
              {d.preferencias.promocao != null && (
                <div>
                  <h3 className="rotulo text-suave mb-2">Promoções</h3>
                  <p>{pct(d.preferencias.promocao)} das peças vistas estão em promoção ou imperdível.</p>
                </div>
              )}
            </section>
          )}

          {d.buscas.length > 0 && (
            <section>
              <h3 className="rotulo text-suave mb-2">Buscas recentes</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                {d.buscas.map((b, i) => (
                  <span key={i} title={formatarDataHora(b.criadoEm)} className={`px-2 py-1 border ${b.resultados === 0 ? 'border-vermelho/40 text-vermelho' : 'border-borda'}`}>
                    “{b.termo}”{b.resultados === 0 ? ' · nada encontrado' : b.resultados != null ? ` · ${b.resultados}` : ''}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Cartao>
  );
}

function Dado({ rotulo, titulo, children }: { rotulo: string; titulo?: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="rotulo !text-[0.6rem] text-suave">{rotulo}</dt>
      <dd className="text-marrom-950" title={titulo}>{children}</dd>
    </div>
  );
}

function Ranking({ titulo, itens }: { titulo: string; itens: { valor: string; parte: number }[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <h3 className="rotulo text-suave mb-2">{titulo}</h3>
      <ul className="grid gap-1.5">
        {itens.map(i => (
          <li key={i.valor} className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <span className="truncate">{i.valor}</span>
            <span className="text-suave text-xs">{pct(i.parte)}</span>
            <div className="col-span-2 h-1.5 bg-bege"><div className="h-full bg-caramelo" style={{ width: `${Math.max(3, i.parte * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
