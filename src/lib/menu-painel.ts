/**
 * Menu do painel: itens soltos e grupos com submenu. O mesmo desenho alimenta o menu lateral, a gaveta do celular e
 * as abas no topo das páginas de um grupo.
 */
export const COOKIE_RECOLHIDO = 'dcerutti-menu-recolhido';

export type ItemMenu = { href: string; rotulo: string; contador?: number };
/** `secao`: título que aparece acima da entrada e abre um bloco do menu. */
export type EntradaMenu = ({ tipo: 'item'; item: ItemMenu } | { tipo: 'grupo'; rotulo: string; itens: ItemMenu[] }) & { secao?: string };

export function menuDoPainel(gestor: boolean, pendentes: number, atendimento?: { fila: number } | null, vitrines = false, pagamentos = false): EntradaMenu[] {
  const item = (href: string, rotulo: string, contador?: number): ItemMenu => ({ href, rotulo, contador });
  return [
    { tipo: 'item', item: item('/painel', gestor ? 'Resumo' : 'Meu painel') },
    // Caixa da loja física (D-23): tela própria, em /caixa; item solto, logo abaixo do Resumo.
    { tipo: 'item', item: item('/caixa', 'Caixa da loja') },
    // Atendimento online (docs/26): a fila do dia primeiro; o gestor vê também a equipe.
    ...(atendimento
      ? ([{
          secao: 'Operação', tipo: 'grupo', rotulo: 'Atendimento', itens: [
            item('/painel/atendimento', 'Hoje', atendimento.fila),
            item('/painel/atendimento/lista', 'Atendimentos'),
            item('/painel/atendimento/respostas', 'Respostas prontas'),
            ...(gestor ? [item('/painel/atendimento/equipe', 'Visão da equipe')] : []),
          ],
        }] satisfies EntradaMenu[])
      : []),
    {
      secao: atendimento ? undefined : 'Operação', tipo: 'grupo', rotulo: 'Vendas', itens: [
        item('/painel/pedidos', 'Pedidos', pendentes),
        // D-27: sugestões de peças que a cliente responde pelo link (para ela, "Sugestões para você").
        item('/painel/sugestoes', 'Sugestões'),
        ...(vitrines ? [item('/painel/vitrines', 'Vitrines')] : []),
        item('/painel/vendas', 'Vendas'),
        // Pagamento online (docs/27): conferência do que entrou pelo Mercado Pago, só para o gestor.
        ...(gestor && pagamentos ? [item('/painel/pagamentos', 'Pagamentos online')] : []),
        // Cupons: o gestor cria e liga; o vendedor vê os disponíveis para divulgar (docs/20-cupons.md).
        item('/painel/cupons', 'Cupons'),
      ],
    },
    {
      tipo: 'grupo', rotulo: 'Clientes', itens: [
        item('/painel/clientes', gestor ? 'Clientes' : 'Meus clientes'),
        // Histórico do cliente (docs/21): o que as clientes veem e procuram na loja.
        item('/painel/interesse', 'Interesse'),
      ],
    },
    ...(gestor
      ? ([
          // D-26: o acompanhamento fica junto do cadastro da equipe.
          { secao: 'Gestão', tipo: 'grupo', rotulo: 'Equipe', itens: [item('/painel/vendedores', 'Vendedores'), item('/painel/numeros', 'Números de WhatsApp'), item('/painel/equipe', 'Acompanhamento')] },
          { tipo: 'item', item: item('/painel/resultados', 'Resultados') },
          { tipo: 'grupo', rotulo: 'Loja', itens: [item('/painel/produtos', 'Produtos'), item('/painel/produtos/importar', 'Importar estoque'), item('/painel/configuracoes', 'Configurações'), item('/editar/inicio', 'Editor da loja'), item('/painel/identidade', 'Identidade visual')] },
        ] satisfies EntradaMenu[])
      : []),
  ];
}

/** O item é a página aberta (ou uma página dentro dele, como a ficha dentro de Clientes)? */
export const itemAtivo = (href: string, caminho: string) => (href === '/painel' ? caminho === href : caminho === href || caminho.startsWith(`${href}/`));
