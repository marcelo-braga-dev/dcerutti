import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlternarCupom, ApagarCupom } from '@/components/painel/cupons-acoes';
import { FormCupom } from '@/components/painel/form-cupom';
import { Alerta, CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { EtiquetaStatus } from '@/components/ui/status-pedido';
import { ROTULO_SITUACAO, situacaoCupom } from '@/lib/cupom';
import { diaDe, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { cupomParaEdicao, opcoesDoCupom, regraDe } from '@/server/consultas/cupons';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Cupom' };

const texto = (v: { toString(): string } | null) => (v == null ? '' : String(Number(v.toString())).replace('.', ','));

export default async function EditarCupom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const u = await exigirPapel(['gestor']);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [dados, o] = await Promise.all([cupomParaEdicao(u, id), opcoesDoCupom(u)]);
  if (!dados) notFound();
  const { cupom: c, usos, desconto, pedidos } = dados;
  const situacao = situacaoCupom(regraDe(c), usos);
  const criado = (await searchParams).criado === '1';

  return (
    <>
      <Link href="/painel/cupons" className="rotulo text-suave hover:text-marrom-950">← Cupons</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Cupom" titulo={c.codigo}
        acoes={<div className="flex flex-wrap gap-2"><AlternarCupom id={c.id} ativo={c.ativo} />{!pedidos.length && <ApagarCupom id={c.id} codigo={c.codigo} />}</div>}>
        <span className="inline-flex flex-wrap items-center gap-2">
          <Etiqueta cor={situacao === 'ativo' ? 'oliva' : situacao === 'agendado' ? 'caramelo' : situacao === 'esgotado' ? 'vermelho' : 'cinza'}>{ROTULO_SITUACAO[situacao]}</Etiqueta>
          {usos} {usos === 1 ? 'uso' : 'usos'}{c.limiteTotal != null ? ` de ${c.limiteTotal}` : ''}{c.tipo !== 'freteGratis' && ` · ${brl(desconto)} de desconto dado`}
        </span>
      </CabecalhoPagina>
      {criado && <div className="mb-4"><Alerta tipo="ok">Cupom criado.</Alerta></div>}

      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <Cartao className="p-5 sm:p-8">
          <FormCupom usado={pedidos.length > 0}
            opcoes={{
              categorias: o.categorias.map(x => ({ valor: String(x.id), rotulo: x.nome })),
              marcas: o.marcas.map(x => ({ valor: String(x.id), rotulo: x.nome })),
              clientes: o.clientes.map(x => ({ valor: x.id, rotulo: x.nome, detalhe: formatarTelefone(x.telefone) })),
            }}
            inicial={{
              id: c.id, codigo: c.codigo, descricao: c.descricao ?? '', tipo: c.tipo, valor: texto(c.valor), tetoDesconto: texto(c.tetoDesconto),
              minimoCompra: texto(c.minimoCompra), inicio: diaDe(c.inicioEm), fim: c.fimEm ? diaDe(c.fimEm) : '',
              limiteTotal: c.limiteTotal == null ? '' : String(c.limiteTotal), limitePorCliente: c.limitePorCliente == null ? '' : String(c.limitePorCliente),
              quemAplica: c.quemAplica, somentePrimeiraCompra: c.somentePrimeiraCompra, valePromocao: c.valePromocao, ativo: c.ativo,
              categorias: c.categorias.map(x => String(x.categoria.id)), marcas: c.marcas.map(x => String(x.marca.id)),
              clientes: c.clientes.map(x => x.cliente.id), referencias: c.produtos.map(x => x.produto.referencia).join(', '),
            }} />
        </Cartao>
        <Cartao className="p-5 sm:p-6">
          <h2 className="titulo text-lg mb-4">Pedidos com este cupom</h2>
          {!pedidos.length ? <p className="text-sm text-suave">Nenhum pedido usou este cupom ainda.</p> : (
            <ul className="divide-y divide-borda text-sm">
              {pedidos.map(p => (
                <li key={p.id} className="py-2 grid gap-0.5">
                  <div className="flex justify-between gap-2">
                    <Link href={`/painel/pedidos/${p.id}`} className="font-semibold text-marrom-950 underline underline-offset-4">{p.codigo}</Link>
                    <EtiquetaStatus status={p.status} />
                  </div>
                  <span>{p.nomeCliente} · {p.vendedor.name}</span>
                  <span className="text-suave">{formatarDataHora(p.criadoEm)} · {p.freteCupom ? 'frete grátis' : `−${brl(p.descontoCupom)}`} · total {brl(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
