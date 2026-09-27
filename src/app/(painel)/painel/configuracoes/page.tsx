import { Alerta, CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarTelefone } from '@/lib/telefone';
import { salvarConfiguracoes } from '@/server/acoes/gestao';
import { lerConfig } from '@/server/config';
import { db } from '@/server/db';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Configurações' };

export default async function Configuracoes() {
  await exigirPapel(['gestor']);
  const [cfg, vendedores] = await Promise.all([
    lerConfig(),
    db.user.findMany({ where: { papel: 'vendedor', ativo: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
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
          <Campo nome="freteValor" rotulo="Frete (R$)" padrao={String(cfg.frete.valor).replace('.', ',')} />
          <Campo nome="freteGratisAcima" rotulo="Frete grátis acima de (R$)" padrao={String(cfg.frete.gratisAcima).replace('.', ',')} />
          <Campo nome="parcelas" rotulo="Parcelas exibidas no produto" tipo="number" padrao={cfg.parcelas} ajuda="0 ou 1 esconde o parcelamento." />
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
