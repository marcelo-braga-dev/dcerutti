import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormCliente } from '@/components/painel/form-cliente';
import { InteresseCliente } from '@/components/painel/interesse-cliente';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { diaDe, formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { registrarVenda } from '@/server/acoes/clientes';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { fichaCliente } from '@/server/consultas/clientes';
import { cuponsDaFicha } from '@/server/consultas/cupons';
import { interesseDoCliente } from '@/server/consultas/navegacao';
import { marcaAtual } from '@/server/marca';

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const ficha = await fichaCliente(u, (await params).id);
  if (!ficha) notFound();
  const { cliente: c, totalComprado: total, vendedores } = ficha;
  // Fase 4 dos cupons: os cupons desta cliente (primeira compra, próxima compra, criados para ela); vazio com cupons desligados.
  const [cupons, interesse, loja] = await Promise.all([cuponsDaFicha(c.id), interesseDoCliente(u, c.id), marcaAtual()]);

  return (
    <>
      <Link href="/painel/clientes" className="rotulo text-suave hover:text-marrom-950">← Clientes</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Ficha do cliente" titulo={c.nome}
        acoes={<>
          {c.telefone && <a href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${loja.nome}.`)} target="_blank" rel="noopener" className={botao('secundario')}>WhatsApp</a>}
          <Link href={`/painel/pedidos/novo?cliente=${c.id}`} className={botao('oliva')}>Montar pedido</Link>
        </>}>
        Total comprado: <strong className="text-marrom-950">{brl(total)}</strong>
        {u.papel === 'gestor' && (() => {
          const v = vendedores?.find(x => x.id === c.vendedorId);
          return v ? <> · Atendida por <Link href={`/painel/vendedores/${v.id}`} className="underline underline-offset-4 text-marrom-950">{v.name}</Link> (<Link href={`/painel/clientes?vendedor=${v.id}`} className="underline underline-offset-4">outras clientes</Link>)</> : null;
        })()}
        {c.pedidos.some(p => p.status === 'pendente') && <> · <Link href={`/painel/pedidos?cliente=${c.id}`} className="underline underline-offset-4 text-caramelo">pedidos em aberto</Link></>}
      </CabecalhoPagina>

      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <div className="grid gap-6">
          {/* Histórico do cliente (docs/21): o que ela vê e separa na loja. */}
          {interesse && <InteresseCliente dados={interesse} temAcesso={!!c.userId} />}
          <Cartao className="p-5 sm:p-8">
            <FormCliente cliente={{ ...c, temAcesso: !!c.userId }} vendedores={vendedores} gestor={u.papel === 'gestor'} />
          </Cartao>
        </div>
        <div className="grid gap-6">
          {cupons.length > 0 && (
            <Cartao className="p-5 sm:p-6">
              <h2 className="titulo text-lg mb-4">Cupons da cliente</h2>
              <ul className="divide-y divide-borda text-sm">
                {cupons.map(x => (
                  <li key={x.id} className={`py-2 grid gap-0.5 ${x.situacao === 'disponivel' || x.situacao === 'agendado' ? '' : 'opacity-60'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="font-display tracking-wide">{x.codigo}</strong>
                      <Etiqueta cor={x.situacao === 'disponivel' ? 'oliva' : x.situacao === 'agendado' ? 'caramelo' : 'cinza'}>
                        {{ disponivel: 'Disponível', agendado: 'Em breve', usado: 'Usado', expirado: 'Vencido' }[x.situacao]}
                      </Etiqueta>
                    </div>
                    <span className="text-suave">{x.regra}</span>
                    <span className="text-suave">{x.situacao === 'agendado' ? `Começa em ${formatarData(x.inicioEm)}` : x.fimEm ? `Até ${formatarData(x.fimEm)}` : 'Sem data para acabar'}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-2">Registrar venda na loja</h2>
            <p className="text-sm text-suave mb-4">
              Com as peças vendidas, o estoque baixa sozinho: <Link href={`/painel/pedidos/novo?cliente=${c.id}&tipo=balcao`} className="underline underline-offset-4 text-marrom-950">escolher as peças</Link>. Sem peças, registre só o valor:
            </p>
            <Formulario acao={registrarVenda} limparAoConcluir className="grid sm:grid-cols-2 gap-4">
              <input type="hidden" name="clienteId" value={c.id} />
              <Campo nome="valor" rotulo="Valor (R$)" placeholder="289,90" />
              <Campo nome="data" rotulo="Data" tipo="date" padrao={diaDe()} />
              <Campo nome="observacao" rotulo="Observação" placeholder="Loja, WhatsApp…" className="sm:col-span-2" />
              <div className="sm:col-span-2"><BotaoEnviar variante="oliva">Registrar venda</BotaoEnviar></div>
            </Formulario>
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Pedidos</h2>
            {c.pedidos.length === 0 ? <p className="text-sm text-suave">Nenhum pedido.</p> : (
              <ul className="divide-y divide-borda">
                {c.pedidos.map(p => (
                  <li key={p.id} className="py-3 flex justify-between gap-3 text-sm">
                    <Link href={`/painel/pedidos/${p.id}`} className="flex gap-2 items-center flex-wrap hover:underline">
                      <strong>{p.codigo}</strong><EtiquetaTipo tipo={p.tipo} /><EtiquetaStatus status={p.status} />
                    </Link>
                    <span className="whitespace-nowrap">{brl(p.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Vendas</h2>
            {c.vendas.length === 0 ? <p className="text-sm text-suave">Nenhuma venda registrada.</p> : (
              <ul className="divide-y divide-borda">
                {c.vendas.map(v => (
                  <li key={v.id} className="py-3 flex justify-between gap-3 text-sm">
                    <span>{formatarData(v.data)} · <span className="text-suave">{v.observacao}</span></span>
                    <span className="font-display font-extrabold whitespace-nowrap">{brl(v.valor)}</span>
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
