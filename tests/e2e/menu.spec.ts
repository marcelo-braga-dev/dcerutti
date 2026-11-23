/** Menu lateral do painel (D-35): áreas diretas, abas no topo, recolher sem perder a escolha e gaveta do celular. */
import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

test.describe('Menu lateral', () => {
  test('computador: um clique por área, abas no topo e a área marcada; recolhe e lembra', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A coluna é só do computador.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel');
    const menu = page.getByRole('navigation', { name: 'Painel' }).first();
    // Sem submenus: nenhum botão de abrir e fechar grupo na coluna.
    expect(await menu.getByRole('button', { expanded: false }).count()).toBe(0);
    expect(await menu.getByRole('button', { expanded: true }).count()).toBe(0);
    for (const nome of ['Início', 'Pedidos', 'Clientes', 'Cupons', 'Produtos', 'Resultados', 'Equipe', 'Configurações'])
      await expect(menu.getByRole('link', { name: new RegExp(`^${nome}`) })).toBeVisible();

    await menu.getByRole('link', { name: /^Pedidos/ }).click();
    await expect(page).toHaveURL(/\/painel\/pedidos$/);
    await expect(menu.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page');
    const abas = page.getByRole('navigation', { name: 'Páginas de Pedidos' });
    await abas.getByRole('link', { name: 'Vendas do mês' }).click();
    await expect(page).toHaveURL(/\/painel\/vendas$/);
    // A página irmã continua marcando a mesma área na coluna.
    await expect(menu.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page');
    await expect(abas.getByRole('link', { name: 'Vendas do mês' })).toHaveAttribute('aria-current', 'page');

    // Configurações reúne geral, pagamento online, identidade visual e página inicial.
    await menu.getByRole('link', { name: 'Configurações' }).click();
    await page.getByRole('navigation', { name: 'Páginas de Configurações' }).getByRole('link', { name: 'Pagamento online' }).click();
    await expect(page).toHaveURL(/\/painel\/configuracoes\/pagamento$/);
    await expect(menu.getByRole('link', { name: 'Configurações' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Recolher o menu' }).click();
    await expect(page.getByRole('button', { name: 'Expandir o menu' })).toBeVisible();
    const largura = async () => (await page.locator('aside').boundingBox())!.width;
    await expect.poll(largura).toBe(76);
    await expect(menu.getByRole('link', { name: 'Resultados' })).toBeVisible();

    // Lembra sem piscar: já vem recolhido do servidor.
    const html = await (await page.request.get('/painel/pedidos')).text();
    expect(html).toContain('data-recolhido="true"');
    await page.reload();
    expect(await largura()).toBe(76);
    await page.getByRole('button', { name: 'Expandir o menu' }).click();
    await expect.poll(largura).toBe(256);
  });

  test('vendedora vê só o dia a dia; páginas da gestão não aparecem', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A coluna é só do computador.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, 'ana@dcerutti.local');
    await page.goto('/painel/clientes');
    const menu = page.getByRole('navigation', { name: 'Painel' }).first();
    await expect(menu.getByRole('link', { name: /^Meus clientes/ })).toHaveAttribute('aria-current', 'page');
    for (const nome of ['Produtos', 'Resultados', 'Equipe', 'Configurações']) expect(await menu.getByRole('link', { name: nome }).count()).toBe(0);
    await page.getByRole('navigation', { name: 'Páginas de Meus clientes' }).getByRole('link', { name: 'Interesse' }).click();
    await expect(page).toHaveURL(/\/painel\/interesse$/);
  });

  test('rodapé fica à vista em tela baixa', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A coluna é só do computador.');
    await page.setViewportSize({ width: 1280, height: 560 });
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel');
    const sair = page.locator('aside').getByRole('button', { name: 'Sair' });
    await expect(sair).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('celular: gaveta abre, fecha com Esc e ao trocar de página', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page, 'ana@dcerutti.local');
    await page.goto('/painel');
    await expect(page.locator('aside')).toBeHidden();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const gaveta = page.getByRole('dialog', { name: 'Menu do painel' });
    await expect(gaveta).toBeVisible();
    await expect(gaveta.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(gaveta).toBeHidden();
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await gaveta.getByRole('link', { name: /^Pedidos/ }).click();
    await expect(page).toHaveURL(/\/painel\/pedidos/);
    await expect(gaveta).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
