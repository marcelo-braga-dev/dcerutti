/** Menu do painel (D-35): áreas diretas, abas por área, área ativa e o que cada papel vê. */
import { describe, expect, it } from 'vitest';
import { abasDaPagina, areaAtiva, menuDoPainel, type SecaoMenu } from '@/lib/menu-painel';

const rotulos = (m: SecaoMenu[]) => m.map(s => [s.titulo ?? '', s.itens.map(i => i.rotulo)]);
const tudo = { atendimento: { fila: 4 }, vitrines: true, pagamentos: true };

describe('estrutura', () => {
  it('gestora: 13 áreas em 5 seções, sem submenus', () => {
    expect(rotulos(menuDoPainel(true, 48, tudo))).toEqual([
      ['', ['Início', 'Caixa da loja']],
      ['Vendas', ['Atendimento', 'Pedidos', 'Sugestões', 'Vitrines']],
      ['Clientes', ['Clientes', 'Cupons']],
      ['Gestão', ['Produtos', 'Resultados', 'Equipe', 'Configurações']],
      ['Ajuda', ['Como usar']],
    ]);
  });

  it('vendedora: só o dia a dia, com os nomes dela', () => {
    expect(rotulos(menuDoPainel(false, 12, tudo))).toEqual([
      ['', ['Meu painel', 'Caixa da loja']],
      ['Vendas', ['Atendimento', 'Pedidos', 'Sugestões', 'Vitrines']],
      ['Clientes', ['Meus clientes', 'Cupons']],
      ['Ajuda', ['Como usar']],
    ]);
  });

  it('atendimento e vitrines desligados somem; pagamentos desligado tira a aba', () => {
    const m = menuDoPainel(true, 0, {});
    const itens = m.flatMap(s => s.itens);
    expect(itens.map(i => i.rotulo)).not.toContain('Atendimento');
    expect(itens.map(i => i.rotulo)).not.toContain('Vitrines');
    expect(itens.find(i => i.rotulo === 'Resultados')!.abas).toBeUndefined();
    expect(itens.find(i => i.rotulo === 'Equipe')!.abas!.map(a => a.rotulo)).toEqual(['Vendedores', 'Acompanhamento', 'Números de WhatsApp']);
  });

  it('nenhum endereço aparece em duas áreas', () => {
    const rotas = menuDoPainel(true, 0, tudo).flatMap(s => s.itens.flatMap(i => [...new Set([i.href, ...(i.abas ?? []).map(a => a.href)])]));
    expect(new Set(rotas).size).toBe(rotas.length);
  });

  it('contadores: a área soma as abas (fila do atendimento, pedidos pendentes)', () => {
    const itens = menuDoPainel(false, 12, tudo).flatMap(s => s.itens);
    expect(itens.find(i => i.rotulo === 'Pedidos')!.contador).toBe(12);
    expect(itens.find(i => i.rotulo === 'Atendimento')!.contador).toBe(4);
    expect(menuDoPainel(false, 0, {}).flatMap(s => s.itens).find(i => i.rotulo === 'Pedidos')!.contador).toBeUndefined();
  });

  it('áreas exclusivas da gestora não chegam à vendedora nem como aba', () => {
    const rotas = menuDoPainel(false, 0, tudo).flatMap(s => s.itens.flatMap(i => [i.href, ...(i.abas ?? []).map(a => a.href)]));
    for (const so of ['/painel/cupons/campanhas', '/painel/atendimento/equipe', '/painel/pagamentos', '/painel/produtos', '/painel/configuracoes', '/painel/vendedores'])
      expect(rotas).not.toContain(so);
  });
});

describe('área ativa e abas', () => {
  const m = menuDoPainel(true, 0, tudo);
  it.each([
    ['/painel', 'Início'],
    ['/painel/pedidos/abc', 'Pedidos'],
    ['/painel/vendas', 'Pedidos'],
    ['/painel/interesse', 'Clientes'],
    ['/painel/clientes/x/historico', 'Clientes'],
    ['/painel/atendimento/lista', 'Atendimento'],
    ['/painel/atendimento/equipe', 'Equipe'],
    ['/painel/produtos/importar', 'Produtos'],
    ['/painel/pagamentos', 'Resultados'],
    ['/painel/configuracoes/pagamento', 'Configurações'],
    ['/painel/identidade', 'Configurações'],
    ['/painel/notificacoes', null],
  ])('%s → %s', (caminho, area) => expect(areaAtiva(m, caminho)?.rotulo ?? null).toBe(area));

  it('abas só nas páginas principais', () => {
    expect(abasDaPagina(m, '/painel/vendas')).toMatchObject({ area: { rotulo: 'Pedidos' }, ativa: '/painel/vendas' });
    expect(abasDaPagina(m, '/painel/pedidos')!.abas.map(a => a.rotulo)).toEqual(['Pedidos', 'Vendas do mês']);
    expect(abasDaPagina(m, '/painel/pedidos/abc')).toBeNull();
    expect(abasDaPagina(m, '/painel/sugestoes')).toBeNull();
  });
});
