/**
 * Menu do painel (D-35). Um clique para cada área de trabalho: a coluna lateral tem só itens diretos, em poucas seções,
 * e as páginas irmãs de uma área (ex.: Pedidos e Vendas) viram ABAS no topo da página, não submenus que abrem e fecham.
 * O mesmo desenho alimenta a coluna, a faixa recolhida, a gaveta do celular e as abas.
 */
export const COOKIE_RECOLHIDO = 'dcerutti-menu-recolhido';

/** Uma página dentro de uma área (vira aba no topo). */
export type Aba = { href: string; rotulo: string; contador?: number };

/** Uma área do menu: o item da coluna. `abas` = as páginas da área (a primeira é a principal, o próprio `href`). */
export type ItemMenu = {
  href: string;
  rotulo: string;
  /** Chave do ícone (components/painel/navegacao.tsx). */
  icone: string;
  contador?: number;
  abas?: Aba[];
  /** Abre uma tela própria, fora do painel (o caixa). */
  telaPropria?: boolean;
};

export type SecaoMenu = { titulo?: string; itens: ItemMenu[] };

type Opcoes = { atendimento?: { fila: number } | null; vitrines?: boolean; pagamentos?: boolean };

/** Uma área só ganha abas quando tem mais de uma página; a primeira aba é a página principal. */
function area(href: string, rotulo: string, icone: string, abas: (Aba | false | null | undefined)[] = [], extra: Partial<ItemMenu> = {}): ItemMenu {
  const lista = abas.filter((a): a is Aba => !!a);
  const contador = lista.reduce((t, a) => t + (a.contador ?? 0), 0) || extra.contador;
  return { href, rotulo, icone, ...(lista.length > 1 ? { abas: lista } : {}), ...extra, ...(contador ? { contador } : {}) };
}

export function menuDoPainel(gestor: boolean, pendentes: number, o: Opcoes = {}): SecaoMenu[] {
  const at = o.atendimento;
  const secoes: SecaoMenu[] = [
    {
      itens: [
        area('/painel', gestor ? 'Início' : 'Meu painel', 'inicio'),
        // D-23: o caixa da loja física é uma tela cheia, à parte do painel.
        area('/caixa', 'Caixa da loja', 'caixa', [], { telaPropria: true }),
      ],
    },
    {
      titulo: 'Vendas',
      itens: [
        // docs/26: a fila do dia é a página principal; a lista e as respostas prontas são abas.
        ...(at ? [area('/painel/atendimento', 'Atendimento', 'atendimento', [
          { href: '/painel/atendimento', rotulo: 'Hoje', contador: at.fila },
          { href: '/painel/atendimento/lista', rotulo: 'Todos' },
          { href: '/painel/atendimento/respostas', rotulo: 'Respostas prontas' },
        ])] : []),
        area('/painel/pedidos', 'Pedidos', 'pedidos', [
          { href: '/painel/pedidos', rotulo: 'Pedidos', contador: pendentes },
          { href: '/painel/vendas', rotulo: gestor ? 'Vendas do mês' : 'Minhas vendas' },
        ]),
        // D-27: peças que a vendedora sugere e a cliente responde pelo link.
        area('/painel/sugestoes', 'Sugestões', 'sugestoes'),
        ...(o.vitrines ? [area('/painel/vitrines', 'Vitrines', 'vitrines')] : []),
      ],
    },
    {
      titulo: 'Clientes',
      itens: [
        area('/painel/clientes', gestor ? 'Clientes' : 'Meus clientes', 'clientes', [
          { href: '/painel/clientes', rotulo: gestor ? 'Clientes' : 'Meus clientes' },
          // docs/21: o que as clientes veem e procuram na loja.
          { href: '/painel/interesse', rotulo: 'Interesse' },
        ]),
        area('/painel/cupons', 'Cupons', 'cupons', [
          { href: '/painel/cupons', rotulo: 'Cupons' },
          gestor && { href: '/painel/cupons/campanhas', rotulo: 'Campanhas' },
        ]),
      ],
    },
  ];
  if (gestor)
    secoes.push(
      {
        titulo: 'Gestão',
        itens: [
          area('/painel/produtos', 'Produtos', 'produtos', [
            { href: '/painel/produtos', rotulo: 'Produtos e estoque' },
            { href: '/painel/produtos/importar', rotulo: 'Importar estoque' },
          ]),
          area('/painel/resultados', 'Resultados', 'resultados', [
            { href: '/painel/resultados', rotulo: 'Resultados' },
            // docs/27: conferência do que entrou pelo Mercado Pago.
            o.pagamentos && { href: '/painel/pagamentos', rotulo: 'Pagamentos online' },
          ]),
          area('/painel/vendedores', 'Equipe', 'equipe', [
            { href: '/painel/vendedores', rotulo: 'Vendedores' },
            // D-26: o que a equipe fez; e a carteira de atendimento de cada uma.
            { href: '/painel/equipe', rotulo: 'Acompanhamento' },
            at && { href: '/painel/atendimento/equipe', rotulo: 'Atendimento da equipe' },
            { href: '/painel/numeros', rotulo: 'Números de WhatsApp' },
          ]),
          area('/painel/configuracoes', 'Configurações', 'configuracoes', [
            { href: '/painel/configuracoes', rotulo: 'Geral' },
            { href: '/painel/configuracoes/pagamento', rotulo: 'Pagamento online' },
            { href: '/painel/identidade', rotulo: 'Identidade visual' },
            { href: '/editar/inicio', rotulo: 'Página inicial' },
          ]),
        ],
      },
    );
  return secoes;
}

/** O endereço é a página aberta ou uma página dentro dela (a ficha dentro de Clientes)? */
export const itemAtivo = (href: string, caminho: string) => (href === '/painel' ? caminho === href : caminho === href || caminho.startsWith(`${href}/`));

const rotasDo = (i: ItemMenu) => [i.href, ...(i.abas ?? []).map(a => a.href)];

/**
 * Área da página aberta. O endereço mais específico ganha: em /painel/atendimento/equipe, a gestora está em Equipe
 * (aba "Atendimento da equipe"), não em Atendimento.
 */
export function areaAtiva(menu: SecaoMenu[], caminho: string): ItemMenu | null {
  let melhor: { item: ItemMenu; tamanho: number } | null = null;
  for (const s of menu)
    for (const i of s.itens)
      for (const r of rotasDo(i))
        if (itemAtivo(r, caminho) && (!melhor || r.length > melhor.tamanho)) melhor = { item: i, tamanho: r.length };
  return melhor?.item ?? null;
}

/** Abas para mostrar no topo: só na página principal de cada aba (não nas fichas e detalhes). */
export function abasDaPagina(menu: SecaoMenu[], caminho: string): { area: ItemMenu; abas: Aba[]; ativa: string } | null {
  for (const s of menu)
    for (const i of s.itens)
      if (i.abas?.some(a => a.href === caminho)) return { area: i, abas: i.abas, ativa: caminho };
  return null;
}
