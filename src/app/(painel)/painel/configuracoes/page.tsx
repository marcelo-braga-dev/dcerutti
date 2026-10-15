import { Alerta, CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarTelefone } from '@/lib/telefone';
import { salvarConfiguracoes } from '@/server/acoes/gestao';
import { lerConfig } from '@/server/config';
import { exigirPapel } from '@/server/permissoes';
import { vendedoresAtivos } from '@/server/consultas/equipe';

export const metadata = { title: 'Configurações' };

export default async function Configuracoes() {
  await exigirPapel(['gestor']);
  const [cfg, vendedores] = await Promise.all([
    lerConfig(),
    vendedoresAtivos(),
  ]);
  return (
    <>
      <CabecalhoPagina sobre="Loja" titulo="Configurações" />
      <Cartao className="p-5 sm:p-8 max-w-3xl">
        <Formulario acao={salvarConfiguracoes} className="grid sm:grid-cols-2 gap-6">
          <Campo nome="whatsappLoja" rotulo="WhatsApp da loja" tipo="tel" mascara="telefone" padrao={formatarTelefone(cfg.whatsappLoja)}
            ajuda="Recebe os pedidos de clientes sem vendedor com WhatsApp válido." />
          <Campo nome="vendedorPadraoId" rotulo="Vendedor padrão para novos clientes" tipo="select" padrao={cfg.vendedorPadraoId}
            opcoes={[{ valor: '', rotulo: 'Primeiro vendedor cadastrado' }, ...vendedores.map(v => ({ valor: v.id, rotulo: v.name }))]}
            ajuda="Para quem se cadastra sem link de convite." />
          <Campo nome="cepsCondicional" rotulo="CEPs atendidos pelo condicional" tipo="textarea" linhas={2} padrao={cfg.cepsCondicional.join(', ')} ajuda="Separe por vírgula." />
          <Campo nome="cidadeCondicional" rotulo="Cidade do condicional" padrao={cfg.cidadeCondicional} />
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-6 border-t border-borda pt-6">
            <Campo nome="cobrarFrete" rotulo="Cobrar frete pelo site" tipo="checkbox" padrao={!!cfg.frete} className="sm:col-span-2"
              ajuda="Desmarcado, a sacola e a mensagem dizem &quot;frete a combinar&quot; e nada é prometido." />
            <Campo nome="freteValor" rotulo="Frete (R$)" padrao={cfg.frete ? String(cfg.frete.valor).replace('.', ',') : ''} placeholder="24,90" />
            <Campo nome="freteGratisAcima" rotulo="Frete grátis acima de (R$)" padrao={cfg.frete ? String(cfg.frete.gratisAcima).replace('.', ',') : ''} placeholder="299,00" ajuda="0 ou vazio: nunca grátis." />
          </div>
          <Campo nome="diasExpiracao" rotulo="Prazo de resposta dos pendentes (dias)" tipo="number" padrao={cfg.diasExpiracao}
            ajuda="Depois do prazo, o pedido aparece como &quot;Prazo vencido&quot; para o vendedor ou o gestor cancelar (a reserva volta ao estoque nessa hora). 0 = sem prazo." />
          <Campo nome="parcelas" rotulo="Parcelas exibidas no produto" tipo="number" padrao={cfg.parcelas} ajuda="0 ou 1 esconde o parcelamento. Só ative depois de confirmar a condição real." />
          <div className="sm:col-span-2 grid gap-3 border-t border-borda pt-6">
            <Campo nome="cuponsLigados" rotulo="Cupons de desconto ligados" tipo="checkbox" padrao={cfg.cupons.ligados}
              ajuda="Desligado, a sacola e o painel não mostram nada de cupom. Os pedidos que já têm cupom continuam como estão." />
            <Campo nome="vendedorAplicaCupom" rotulo="Vendedores podem aplicar cupons nos pedidos" tipo="checkbox" padrao={cfg.cupons.vendedorAplica}
              ajuda="Só cupons marcados para o vendedor ou para cliente e vendedor. Os cupons são criados em Cupons." />
          </div>
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-borda pt-6">
            <Campo nome="historicoLigado" rotulo="Registrar a navegação das clientes" tipo="checkbox" padrao={cfg.historico.ligado} className="sm:col-span-2"
              ajuda="Páginas, peças vistas, buscas e sacola de cada cliente logada, para a equipe ver na ficha e em Interesse. Guardado por 12 meses, sem IP." />
            <Campo nome="avisarSacola" rotulo="Avisar o vendedor da sacola parada" tipo="checkbox" padrao={cfg.historico.avisarSacola} className="sm:col-span-2"
              ajuda="E-mail para o vendedor (ou para os gestores, se ele estiver inativo) quando a cliente separa peças e não envia o pedido." />
            <Campo nome="horasSacola" rotulo="Avisar depois de (horas)" tipo="number" padrao={cfg.historico.horasSacola} ajuda="De 1 a 168 (7 dias)." />
          </div>
          <div className="sm:col-span-2 grid gap-3 border-t border-borda pt-6">
            <Campo nome="catalogoPublico" rotulo="Catálogo público (visitantes veem o catálogo sem entrar)" tipo="checkbox" padrao={cfg.catalogoPublico} />
            <Alerta tipo="aviso">Mesmo público, enviar pedido continua exigindo conta. Indexação no Google e prévia de links ainda não estão configuradas (ver docs, D-09).</Alerta>
          </div>
          <div className="sm:col-span-2"><BotaoEnviar>Salvar configurações</BotaoEnviar></div>
        </Formulario>
      </Cartao>
    </>
  );
}
