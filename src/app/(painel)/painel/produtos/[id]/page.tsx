import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormProduto } from '@/components/painel/form-produto';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarDataHora } from '@/lib/datas';
import { posicaoTamanho } from '@/lib/catalogo';
import { adicionarVariante, ajustarEstoque, removerVariante } from '@/server/acoes/produtos';
import { db } from '@/server/db';
import { exigirPapel } from '@/server/permissoes';
import { r2Configurado } from '@/server/r2';

const MOTIVOS = { entrada: 'Entrada', ajuste: 'Ajuste', venda: 'Venda' } as const;

export default async function EditarProduto({ params }: { params: Promise<{ id: string }> }) {
  await exigirPapel(['gestor']);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p, marcas, categorias] = await Promise.all([
    db.produto.findUnique({ where: { id }, include: { imagens: { orderBy: { ordem: 'asc' } }, custo: true, variantes: { include: { _count: { select: { itens: true } } } } } }),
    db.marca.findMany({ orderBy: { nome: 'asc' } }),
    db.categoria.findMany({ orderBy: { nome: 'asc' } }),
  ]);
  if (!p) notFound();
  const variantes = [...p.variantes].sort((a, b) => posicaoTamanho(a.tamanho) - posicaoTamanho(b.tamanho));
  const movimentos = await db.movimentoEstoque.findMany({ where: { varianteId: { in: variantes.map(v => v.id) } }, orderBy: { criadoEm: 'desc' }, take: 30 });
  const usuarios = new Map((await db.user.findMany({ where: { id: { in: movimentos.map(m => m.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map(u => [u.id, u.name]));
  const tamanhoDe = new Map(variantes.map(v => [v.id, v.tamanho]));

  return (
    <>
      <Link href="/painel/produtos" className="rotulo text-suave hover:text-marrom-950">← Produtos</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={p.referencia} titulo={p.nome} acoes={p.ativo ? <Link href={`/produto/${p.referencia}`} className="rotulo underline underline-offset-4">Ver na loja</Link> : undefined} />
      <div className="grid 2xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <Cartao className="p-5 sm:p-8"><FormProduto produto={p} marcas={marcas} categorias={categorias} upload={r2Configurado()} /></Cartao>
        <div className="grid gap-6">
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Tamanhos e estoque</h2>
            {variantes.length === 0 ? <p className="text-sm text-suave mb-4">Nenhum tamanho cadastrado.</p> : (
              <table className="w-full text-sm mb-6">
                <thead className="text-left rotulo text-suave border-b border-borda"><tr><th className="py-2">Tam.</th><th>Cód.</th><th>Estoque</th><th>Reserv.</th><th /></tr></thead>
                <tbody className="divide-y divide-borda">
                  {variantes.map(v => (
                    <tr key={v.id}>
                      <td className="py-2 font-display font-bold">{v.tamanho}</td>
                      <td className="text-suave">{v.codigoInterno ?? '—'}</td>
                      <td className={v.estoque ? '' : 'text-vermelho'}>{v.estoque}</td>
                      <td className="text-suave">{v.reservado || ''}</td>
                      <td className="text-right">
                        {v._count.itens === 0 && v.reservado === 0 && (
                          <form action={removerVariante.bind(null, v.id)}><button className="rotulo !text-[0.6rem] text-vermelho hover:underline">Remover</button></form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {variantes.length > 0 && (
              <Formulario acao={ajustarEstoque} limparAoConcluir className="grid sm:grid-cols-2 gap-3 border-t border-borda pt-5">
                <h3 className="sm:col-span-2 rotulo text-caramelo">Movimentar estoque</h3>
                <Campo nome="varianteId" rotulo="Tamanho" tipo="select" opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...variantes.map(v => ({ valor: String(v.id), rotulo: `${v.tamanho} (${v.estoque})` }))]} />
                <Campo nome="tipo" rotulo="Tipo" tipo="select" opcoes={[{ valor: 'entrada', rotulo: 'Entrada (somar)' }, { valor: 'ajuste', rotulo: 'Ajuste (quantidade contada)' }]} />
                <Campo nome="quantidade" rotulo="Quantidade" tipo="number" />
                <Campo nome="observacao" rotulo="Observação" placeholder="Nota fiscal, contagem…" />
                <div className="sm:col-span-2"><BotaoEnviar>Registrar</BotaoEnviar></div>
              </Formulario>
            )}
            <Formulario acao={adicionarVariante} limparAoConcluir className="grid sm:grid-cols-2 gap-3 border-t border-borda pt-5 mt-5">
              <h3 className="sm:col-span-2 rotulo text-caramelo">Adicionar tamanho</h3>
              <input type="hidden" name="produtoId" value={p.id} />
              <Campo nome="tamanho" rotulo="Tamanho" placeholder="M" />
              <Campo nome="estoque" rotulo="Estoque inicial" tipo="number" padrao={0} />
              <Campo nome="codigoInterno" rotulo="Código interno" />
              <Campo nome="ean" rotulo="EAN" />
              <div className="sm:col-span-2"><BotaoEnviar variante="secundario">Adicionar</BotaoEnviar></div>
            </Formulario>
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Histórico de estoque</h2>
            {movimentos.length === 0 ? <p className="text-sm text-suave">Sem movimentações.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {movimentos.map(m => (
                  <li key={m.id} className="py-2 flex justify-between gap-3">
                    <span>
                      <strong className={m.delta > 0 ? 'text-oliva' : 'text-vermelho'}>{m.delta > 0 ? '+' : ''}{m.delta}</strong> · Tam. {tamanhoDe.get(m.varianteId)} · {MOTIVOS[m.motivo]}
                      {m.observacao && <span className="text-suave"> · {m.observacao}</span>}
                    </span>
                    <span className="text-suave text-right whitespace-nowrap">{formatarDataHora(m.criadoEm)}{m.usuarioId && <><br />{usuarios.get(m.usuarioId)?.split(' ')[0]}</>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
