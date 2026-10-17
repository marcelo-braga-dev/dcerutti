/**
 * Menu do painel: itens soltos e grupos com submenu. O mesmo desenho alimenta o menu lateral, a gaveta do celular e
 * as abas no topo das páginas de um grupo.
 */
export type ItemMenu = { href: string; rotulo: string; contador?: number };
export type EntradaMenu = { tipo: 'item'; item: ItemMenu } | { tipo: 'grupo'; rotulo: string; itens: ItemMenu[] };

export function menuDoPainel(gestor: boolean, pendentes: number): EntradaMenu[] {
  const item = (href: string, rotulo: string, contador?: number): ItemMenu => ({ href, rotulo, contador });
  return [
    { tipo: 'item', item: item('/painel', gestor ? 'Resumo' : 'Meu painel') },
    // Caixa da loja física (D-23): tela própria, em /caixa; item solto, logo abaixo do Resumo.
    { tipo: 'item', item: item('/caixa', 'Caixa da loja') },
    {
      tipo: 'grupo', rotulo: 'Vendas', itens: [
        item('/painel/pedidos', 'Pedidos', pendentes),
        // D-27: sugestões de peças que a cliente responde pelo link (para ela, "Sugestões para você").
        item('/painel/sugestoes', 'Sugestões'),
        item('/painel/vendas', 'Vendas'),
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
          { tipo: 'grupo', rotulo: 'Equipe', itens: [item('/painel/vendedores', 'Vendedores'), item('/painel/equipe', 'Acompanhamento')] },
          { tipo: 'item', item: item('/painel/resultados', 'Resultados') },
          { tipo: 'grupo', rotulo: 'Loja', itens: [item('/painel/produtos', 'Produtos'), item('/painel/configuracoes', 'Configurações'), item('/painel/identidade', 'Identidade visual')] },
        ] satisfies EntradaMenu[])
      : []),
  ];
}

/** O item é a página aberta (ou uma página dentro dele, como a ficha dentro de Clientes)? */
export const itemAtivo = (href: string, caminho: string) => (href === '/painel' ? caminho === href : caminho === href || caminho.startsWith(`${href}/`));
