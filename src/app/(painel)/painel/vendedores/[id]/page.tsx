import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormVendedor } from '@/components/painel/form-vendedor';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { mesDe, nomeDoMes, somarMeses } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { desativarVendedor, reativarVendedor, salvarMeta } from '@/server/acoes/gestao';
import { exigirPapel } from '@/server/permissoes';
import { metasDoMes } from '@/server/relatorios';
import { vendedorParaEdicao } from '@/server/consultas/equipe';
import { BotaoAcao } from '@/components/ui/botao-acao';

export default async function EditarVendedor({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(['gestor']);
  const r = await vendedorParaEdicao(u, (await params).id);
  if (!r) notFound();
  const { vendedor: v, outros } = r;
  const mes = mesDe();
  const metaAtual = (await metasDoMes([v.id], mes)).get(v.id);

  return (
    <>
      <Link href="/painel/vendedores" className="rotulo text-suave hover:text-marrom-950">← Vendedores</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Vendedor" titulo={v.name}>{v.ativo ? `${v._count.clientes} clientes` : <Etiqueta cor="cinza">Inativo</Etiqueta>}</CabecalhoPagina>
      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <Cartao className="p-5 sm:p-8"><FormVendedor vendedor={v} meta={metaAtual} /></Cartao>
        <div className="grid gap-6">
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Metas mensais</h2>
            <Formulario acao={salvarMeta} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end mb-5">
              <input type="hidden" name="vendedorId" value={v.id} />
              <Campo nome="mes" rotulo="Mês" tipo="month" padrao={somarMeses(mes, 1)} />
              <Campo nome="valor" rotulo="Meta (R$)" placeholder="15000" />
              <BotaoEnviar>Salvar</BotaoEnviar>
            </Formulario>
            {v.metas.length === 0 ? <p className="text-sm text-suave">Nenhuma meta cadastrada.</p> : (
              <ul className="divide-y divide-borda text-sm">
                {v.metas.map(m => <li key={m.id} className="py-2 flex justify-between"><span>{nomeDoMes(m.mes)}</span><strong>{brl(m.valor)}</strong></li>)}
              </ul>
            )}
            <p className="mt-3 text-xs text-suave">Mês sem meta própria usa a meta mais recente anterior.</p>
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            {v.ativo ? (
              <>
                <h2 className="titulo text-lg mb-2">Desativar acesso</h2>
                <p className="text-sm text-suave mb-4">O vendedor deixa de entrar no painel. Vendas e pedidos continuam registrados.</p>
                <Formulario acao={desativarVendedor} className="grid gap-4">
                  <input type="hidden" name="id" value={v.id} />
                  {v._count.clientes > 0 && (
                    <Campo nome="transferirPara" rotulo={`Transferir os ${v._count.clientes} clientes para`} tipo="select"
                      opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...outros.map(o => ({ valor: o.id, rotulo: o.name }))]} />
                  )}
                  <BotaoEnviar variante="perigo" pendente="Desativando…">Desativar vendedor</BotaoEnviar>
                </Formulario>
              </>
            ) : (
              <div>
                <h2 className="titulo text-lg mb-2">Vendedor inativo</h2>
                <BotaoAcao acao={reativarVendedor.bind(null, v.id)} className={botao('oliva')}>Reativar acesso</BotaoAcao>
              </div>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
