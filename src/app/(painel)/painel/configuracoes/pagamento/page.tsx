import Link from 'next/link';
import { ConexaoPagamento } from './conexao';
import { Alerta, CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarDataHora } from '@/lib/datas';
import { salvarPagamentoOnline } from '@/server/acoes/pagamentos';
import { lerConfig } from '@/server/config';
import { saudeDoPagamento } from '@/server/consultas/pagamentos';
import { gatewayConfigurado } from '@/server/pagamentos/gateway';
import { exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';

export const metadata = { title: 'Pagamento online' };

/**
 * Configuração da plataforma de pagamento (docs/27): a conexão com o Mercado Pago, como a loja recebe e o passo a passo
 * para ligar. Credenciais nunca são digitadas aqui: ficam no .env do servidor; a página só mostra se existem e o final.
 */
export default async function ConfiguracaoPagamento() {
  const u = await exigirPapel(['gestor']);
  const [cfg, site] = await Promise.all([lerConfig(), urlDoSite()]);
  const s = await saudeDoPagamento(u, site);
  const p = cfg.pagamentoOnline;
  const pronto = gatewayConfigurado();

  const situacao =
    s.modo === 'bloqueado' ? { cor: 'vermelho' as const, texto: 'Bloqueado', detalhe: 'O modo simulado foi pedido no banco de produção. Retire PAGAMENTO_GATEWAY do .env e recarregue o app.' }
    : !pronto ? { cor: 'cinza' as const, texto: 'Sem credenciais', detalhe: 'Falta o Access Token do Mercado Pago no servidor. Dá para deixar tudo configurado; nada é cobrado até ele existir.' }
    : !p.ligado ? { cor: 'cinza' as const, texto: 'Desligado', detalhe: 'A conexão está pronta. Ligue em "Como a loja recebe" para a equipe gerar links de pagamento.' }
    : s.modo === 'simulado' ? { cor: 'caramelo' as const, texto: 'Ligado em modo simulado', detalhe: 'Ambiente de teste: nada é cobrado de verdade; a página de pagamento mostra "Simular pagamento aprovado".' }
    : { cor: 'oliva' as const, texto: s.ambiente === 'teste' ? 'Ligado (credenciais de teste)' : 'Ligado e cobrando', detalhe: s.ambiente === 'teste' ? 'Pagamentos de teste do Mercado Pago: nada cai na conta.' : 'As clientes pagam pelo link com Pix ou cartão.' };

  const passos = [
    { feito: pronto && s.modo !== 'simulado', titulo: 'Conta e aplicação no Mercado Pago', texto: 'Conta PJ no CNPJ da loja → Suas integrações → criar a aplicação (pagamentos online, API Orders).' },
    { feito: !!s.credenciais.token && !!s.credenciais.segredo, titulo: 'Credenciais no servidor', texto: 'MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET no .env (quem cuida do servidor faz; nunca por mensagem ou e-mail). Depois, recarregar o app.' },
    { feito: !!s.ultimoAviso, titulo: 'Aviso de pagamento cadastrado', texto: 'No Mercado Pago: Webhooks → Configurar notificações → evento "Order", com o endereço abaixo. Fica marcado quando o primeiro aviso chega.' },
    { feito: !!s.ambiente, titulo: 'Ambiente definido', texto: 'MP_AMBIENTE=teste com as credenciais de teste; MP_AMBIENTE=producao com as de produção.' },
    { feito: null, titulo: 'Conferência automática (cron)', texto: 'A cada 10 minutos: npm run pagamentos:conciliar. O site também confere sozinho, mas o cron garante mesmo sem acesso.' },
    { feito: p.ligado, titulo: 'Ligar o pagamento online', texto: 'Em "Como a loja recebe", abaixo.' },
    { feito: s.totalCobrancas > 0 && s.modo === 'mercadopago', titulo: 'Primeiro pagamento real', texto: 'Um pedido de R$ 1 pago com Pix e estornado, do link ao painel, antes de mandar para as clientes.' },
  ];

  return (
    <>
      <CabecalhoPagina sobre="Mercado Pago" titulo="Pagamento online"
        acoes={<Link href="/painel/pagamentos" className="rotulo underline underline-offset-4">Ver pagamentos recebidos</Link>}>
        <span className="inline-flex flex-wrap items-center gap-2"><Etiqueta cor={situacao.cor}>{situacao.texto}</Etiqueta> <span className="text-suave">{situacao.detalhe}</span></span>
      </CabecalhoPagina>

      <div className="grid xl:grid-cols-[1.25fr_1fr] gap-6 items-start">
        <div className="grid gap-6">
          <Cartao className="p-5 sm:p-6 grid gap-4">
            <div>
              <h2 className="titulo text-lg">Conexão com o Mercado Pago</h2>
              <p className="text-xs text-suave">As credenciais ficam só no servidor. Aqui aparece se existem e os 4 últimos caracteres, para conferir qual está em uso.</p>
            </div>
            {s.modo === 'bloqueado' && <Alerta>Pagamento bloqueado: PAGAMENTO_GATEWAY=falso no banco de produção. Retire a linha do .env e recarregue o app.</Alerta>}
            <ConexaoPagamento saude={{ ...s, ultimoAviso: s.ultimoAviso ? { ...s.ultimoAviso, quando: formatarDataHora(s.ultimoAviso.criadoEm) } : null }} pronto={pronto} />
          </Cartao>

          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-1">Como a loja recebe</h2>
            <p className="text-xs text-suave mb-4">Vale para o link de pagamento que a equipe gera no pedido e para o &quot;Pagar agora&quot; da cliente.</p>
            <Formulario acao={salvarPagamentoOnline} className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Campo nome="ligado" rotulo="Pagamento online ligado" tipo="checkbox" padrao={p.ligado} className="sm:col-span-2"
                ajuda="Desligado, nada de pagamento aparece para a equipe nem para as clientes. As cobranças já feitas continuam visíveis." />
              <div className="sm:col-span-2 border-t border-borda pt-4 rotulo text-marrom-900">Meios</div>
              <Campo nome="pix" rotulo="Pix" tipo="checkbox" padrao={p.pix} ajuda="QR e copia e cola na página da loja; aprovação na hora." />
              <Campo nome="cartao" rotulo="Cartão (checkout do Mercado Pago)" tipo="checkbox" padrao={p.cartao} ajuda="Crédito parcelado, débito e saldo Mercado Pago. A loja nunca vê o cartão." />
              <Campo nome="minutosPix" rotulo="Validade do Pix (minutos)" tipo="number" padrao={p.minutosPix} ajuda="As peças ficam reservadas durante esse tempo. De 10 a 1440." />
              <Campo nome="minutosCheckout" rotulo="Tempo para pagar no cartão (minutos)" tipo="number" padrao={p.minutosCheckout} ajuda="De 15 a 1440." />
              <div className="sm:col-span-2 border-t border-borda pt-4 rotulo text-marrom-900">Parcelamento no cartão</div>
              <Campo nome="parcelasMax" rotulo="Em até (vezes)" tipo="number" padrao={p.parcelasMax} ajuda="De 1 a 12." />
              <Campo nome="parcelasSemJuros" rotulo="Sem juros até (vezes)" tipo="number" padrao={p.parcelasSemJuros} ajuda="1 = juros por conta da cliente. Acima de 1, a loja paga os juros dessas parcelas ao Mercado Pago." />
              <div className="sm:col-span-2 border-t border-borda pt-4 rotulo text-marrom-900">Pedido e equipe</div>
              <Campo nome="confirmarAoPagar" rotulo="Confirmar a venda sozinho quando a compra é paga" tipo="checkbox" padrao={p.confirmarAoPagar} className="sm:col-span-2"
                ajuda="Baixa o estoque e conta na meta da vendedora da cliente na hora do pagamento. Desmarcado, o pedido fica pago e a vendedora confirma." />
              <Campo nome="pagarNaSacola" rotulo="Mostrar &quot;Pagar agora&quot; para a cliente" tipo="checkbox" padrao={p.pagarNaSacola} className="sm:col-span-2"
                ajuda="Depois de enviar a sacola e em Minha conta, quando o pedido já tem frete definido. Desmarcado, só pelo link da vendedora." />
              <Campo nome="quemEstorna" rotulo="Quem pode estornar" tipo="select" padrao={p.quemEstorna}
                opcoes={[{ valor: 'gestor', rotulo: 'Só o gestor' }, { valor: 'equipe', rotulo: 'Gestor e vendedores (dos próprios pedidos)' }]} />
              <div className="sm:col-span-2"><BotaoEnviar>Salvar</BotaoEnviar></div>
            </Formulario>
          </Cartao>
        </div>

        <Cartao className="p-5 sm:p-6 grid gap-4">
          <h2 className="titulo text-lg">Passo a passo para ligar</h2>
          <ol className="grid gap-4">
            {passos.map((x, i) => (
              <li key={x.titulo} className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                <span aria-hidden="true" className={`size-8 rounded-full grid place-items-center font-display font-extrabold text-sm ${x.feito ? 'bg-oliva text-creme' : 'bg-bege text-caramelo'}`}>{x.feito ? '✓' : i + 1}</span>
                <div>
                  <div className="font-semibold text-marrom-950">{x.titulo}{x.feito === true && <span className="sr-only"> (feito)</span>}</div>
                  <div className="text-sm text-suave">{x.texto}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-suave border-t border-borda pt-3">Taxas, prazo de recebimento e dados bancários são definidos na conta do Mercado Pago, não aqui.</p>
        </Cartao>
      </div>
    </>
  );
}
