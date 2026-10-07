import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { atualizarMeusDados, excluirMinhaConta, sair } from '@/server/acoes/conta';
import { cancelarMeuPedido } from '@/server/acoes/pedidos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { exigirPapel } from '@/server/permissoes';
import { fichaDoClienteLogado } from '@/server/consultas/clientes';
import { plural, valoresDoPedido } from '@/lib/pedido';

export const metadata = { title: 'Minha conta' };

type PedidoDaConta = NonNullable<Awaited<ReturnType<typeof fichaDoClienteLogado>>>['pedidos'][number];
const valores = (p: PedidoDaConta) => valoresDoPedido(p);

export default async function MinhaConta() {
  const u = await exigirPapel(['cliente']);
  const cliente = await fichaDoClienteLogado(u);

  return (
    <div className="py-8 max-w-4xl">
      <CabecalhoPagina sobre="Minha conta" titulo={`Olá, ${u.name.split(' ')[0]}`}
        acoes={<form action={sair}><button className="rotulo underline underline-offset-4 text-suave">Sair</button></form>}>
        {cliente?.vendedor && <>Quem te atende: <strong className="text-marrom-950">{cliente.vendedor.name}</strong>{cliente.vendedor.telefone ? ` · ${cliente.vendedor.telefone}` : ''}</>}
      </CabecalhoPagina>

      <h2 className="titulo text-xl mb-4">Meus pedidos</h2>
      {!cliente?.pedidos.length ? (
        <Vazio>Você ainda não enviou pedidos.<div className="mt-4"><BotaoLink href="/catalogo">Ver o catálogo</BotaoLink></div></Vazio>
      ) : (
        <div className="grid gap-4">
          {cliente.pedidos.map(p => (
            <Cartao key={p.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-extrabold text-lg">{p.codigo}</span>
                  <EtiquetaTipo tipo={p.tipo} />
                  <EtiquetaStatus status={p.status} />
                </div>
                <span className="text-sm text-suave">{formatarDataHora(p.criadoEm)}</span>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                {p.itens.map(i => (
                  <div key={i.id} className={`relative w-14 aspect-[3/4] bg-bege ${i.situacao === 'devolvido' ? 'opacity-40' : ''}`} title={`${i.nome} · Tam. ${i.tamanho}`}>
                    <Foto src={i.imagem} alt={i.nome} sizes="56px" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between text-sm">
                <span className="text-suave">
                  {plural(valores(p).unidades, 'peça', 'peças')}
                  {valores(p).ficaram != null && ` · ${valores(p).ficaram ? `${plural(valores(p).ficaram!, 'ficou', 'ficaram')}` : 'nenhuma ficou'}`}
                  {valores(p).frete != null && ` · frete ${valores(p).frete ? brl(valores(p).frete) : 'grátis'}`}
                </span>
                <span className="font-display font-extrabold">{brl(valores(p).total)}</span>
              </div>
              {p.status === 'pendente' && (
                <div className="mt-3 flex justify-end">
                  <BotaoAcao acao={cancelarMeuPedido.bind(null, p.id)} confirmar={`Cancelar ${p.codigo}? As peças voltam a ficar disponíveis.`} className="rotulo !text-[0.65rem] text-suave underline underline-offset-4">
                    Cancelar {p.tipo === 'condicional' ? 'condicional' : 'pedido'}
                  </BotaoAcao>
                </div>
              )}
            </Cartao>
          ))}
        </div>
      )}

      {cliente && (
        <section className="mt-16 border-t border-borda pt-8">
          <h2 className="titulo text-lg mb-4">Meus dados</h2>
          <Formulario acao={atualizarMeusDados} className="grid sm:grid-cols-2 gap-5 max-w-2xl">
            <Campo nome="nome" rotulo="Nome completo" padrao={cliente.nome} autoComplete="name" className="sm:col-span-2" />
            <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" padrao={cliente.telefone} autoComplete="tel" />
            <Campo nome="cep" rotulo="CEP" mascara="cep" padrao={cliente.cep} placeholder="89874-000" autoComplete="postal-code" />
            <Campo nome="endereco" rotulo="Endereço" padrao={cliente.endereco} placeholder="Rua, número, bairro" autoComplete="street-address" className="sm:col-span-2" />
            <Campo nome="cidade" rotulo="Cidade" padrao={cliente.cidade} autoComplete="address-level2" />
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <BotaoEnviar>Salvar meus dados</BotaoEnviar>
              <span className="text-sm text-suave">E-mail de acesso: {u.email}. Para trocar, fale com a loja.</span>
            </div>
          </Formulario>
        </section>
      )}

      <section id="excluir" className="mt-16 border-t border-borda pt-8 scroll-mt-28">
        <h2 className="titulo text-lg mb-2">Excluir minha conta</h2>
        <p className="text-sm text-suave mb-4 max-w-2xl">Apaga seu acesso e seus dados pessoais (nome, WhatsApp, e-mail, endereço). Os pedidos ficam registrados para a loja, sem identificar você. Não dá para desfazer. Veja a <a href="/privacidade" className="underline">política de privacidade</a>.</p>
        <BotaoAcao acao={excluirMinhaConta} confirmar="Excluir sua conta e seus dados pessoais? Não dá para desfazer." depois="/entrar" className={botao('perigo')}>Excluir minha conta</BotaoAcao>
      </section>
    </div>
  );
}
