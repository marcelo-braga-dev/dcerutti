import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Etiqueta, Kpi, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';
import { posicaoTamanho } from '@/lib/catalogo';
import { db } from '@/server/db';
import { exigirPapel } from '@/server/permissoes';
import { indicadoresEstoque } from '@/server/relatorios';

export const metadata = { title: 'Produtos' };

const FILTROS = [['', 'Todos'], ['sem-foto', 'Sem foto'], ['sem-custo', 'Sem custo'], ['esgotados', 'Esgotados'], ['inativos', 'Inativos']] as const;
const POR_PAGINA = 40;

export default async function Produtos({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string; pagina?: string }> }) {
  await exigirPapel(['gestor']);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const filtro = sp.filtro ?? '';
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const where: Prisma.ProdutoWhereInput = {
    ...(q ? { OR: [{ nome: { contains: q } }, { referencia: { contains: q } }, { variantes: { some: { codigoInterno: q } } }] } : {}),
    ...(filtro === 'sem-foto' ? { imagens: { none: {} } } : {}),
    ...(filtro === 'sem-custo' ? { custo: { is: null } } : {}),
    ...(filtro === 'esgotados' ? { variantes: { none: { estoque: { gt: 0 } } } } : {}),
    ...(filtro === 'inativos' ? { ativo: false } : {}),
  };
  const [ind, total, produtos] = await Promise.all([
    indicadoresEstoque(),
    db.produto.count({ where }),
    db.produto.findMany({
      where, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], take: POR_PAGINA * pagina,
      include: { marca: true, categoria: true, custo: true, imagens: { take: 1, orderBy: { ordem: 'asc' } }, variantes: true },
    }),
  ]);
  const url = (m: Record<string, string | number>) => `/painel/produtos?${new URLSearchParams({ ...(q ? { q } : {}), ...(filtro ? { filtro } : {}), ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <CabecalhoPagina sobre="Catálogo e estoque" titulo="Produtos e custos" acoes={<BotaoLink href="/painel/produtos/novo">+ Novo produto</BotaoLink>} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <Kpi rotulo="Peças em estoque" valor={ind.pecas.toLocaleString('pt-BR')} detalhe={`${ind.modelos} modelos ativos · ${ind.semFoto} sem foto`} />
        <Kpi rotulo="Estoque a preço de custo" valor={brl(ind.aCusto)} detalhe={ind.semCusto ? `${ind.semCusto} produto(s) sem custo` : 'Capital parado em mercadoria'} />
        <Kpi rotulo="Estoque a preço de venda" valor={brl(ind.aVenda)} detalhe="Receita potencial" />
        <Kpi rotulo="Lucro potencial" valor={brl(ind.lucro)} detalhe={`${Math.round(ind.margem * 100)}% de margem média`} tom="escuro" />
      </div>
      <div className="flex flex-wrap gap-3 justify-between mb-4">
        <div className="flex flex-wrap gap-1">
          {FILTROS.map(([f, rotulo]) => (
            <Link key={f} href={`/painel/produtos?${new URLSearchParams({ ...(q ? { q } : {}), ...(f ? { filtro: f } : {}) })}`}
              className={`px-3 py-2 rotulo border ${filtro === f ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte bg-card'}`}>{rotulo}</Link>
          ))}
        </div>
        <form className="flex">
          {filtro && <input type="hidden" name="filtro" value={filtro} />}
          <input name="q" defaultValue={q} placeholder="Nome, referência ou código" aria-label="Buscar produto" className="h-10 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
          <button className="h-10 px-3 bg-marrom-950 text-creme rotulo">Buscar</button>
        </form>
      </div>
      <p className="text-sm text-suave mb-3">{total} produto(s)</p>
      {produtos.length === 0 ? <Vazio>Nenhum produto encontrado.</Vazio> : (
        <Cartao className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="text-left rotulo text-suave border-b border-borda">
              <tr><th className="p-3">Produto</th><th className="p-3">Preço</th><th className="p-3">Custo</th><th className="p-3">Margem</th><th className="p-3">Estoque</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {produtos.map(p => {
                const preco = Number(p.preco), custo = p.custo ? Number(p.custo.valor) : null;
                const margem = custo != null && preco ? Math.round(((preco - custo) / preco) * 100) : null;
                const vars = [...p.variantes].sort((a, b) => posicaoTamanho(a.tamanho) - posicaoTamanho(b.tamanho));
                return (
                  <tr key={p.id} className={p.ativo ? '' : 'opacity-50'}>
                    <td className="p-3">
                      <div className="flex gap-3 items-center">
                        <div className="relative w-10 aspect-[3/4] bg-bege shrink-0"><Foto src={p.imagens[0]?.url} alt="" sizes="40px" /></div>
                        <div className="min-w-0">
                          <Link href={`/painel/produtos/${p.id}`} className="text-marrom-950 hover:underline line-clamp-1">{p.nome}</Link>
                          <div className="text-xs text-suave">{p.referencia} · {p.marca.nome} · {p.categoria.nome} {!p.ativo && <Etiqueta cor="cinza">Inativo</Etiqueta>} {p.imperdivel && <Etiqueta cor="imperdivel">Imperdível</Etiqueta>}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{brl(preco)}{Number(p.precoCheio) > preco && <div className="text-xs text-suave line-through">{brl(p.precoCheio)}</div>}</td>
                    <td className="p-3 whitespace-nowrap">{custo != null ? brl(custo) : <span className="text-vermelho">—</span>}</td>
                    <td className="p-3 font-bold" style={{ color: margem == null ? '#76685D' : margem >= 50 ? '#5E6B43' : margem >= 30 ? '#6D402A' : '#B8462F' }}>{margem != null ? `${margem}%` : '—'}</td>
                    <td className="p-3 text-xs">{vars.filter(v => v.estoque > 0).map(v => `${v.tamanho} (${v.estoque}${v.reservado ? `, ${v.reservado} res.` : ''})`).join('  ') || <span className="text-vermelho">Esgotado</span>}</td>
                    <td className="p-3 text-right"><Link href={`/painel/produtos/${p.id}`} className={botao('fantasma', 'p')}>Editar</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Cartao>
      )}
      {total > produtos.length && <div className="mt-6 text-center"><Link href={url({ pagina: pagina + 1 })} scroll={false} className={botao('secundario')}>Carregar mais</Link></div>}
    </>
  );
}
