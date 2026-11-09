/** Menu lateral do painel: página atual, grupos, recolher sem perder a escolha e gaveta do celular. */
import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

test.describe('Menu lateral', () => {
  test('computador: marca a página, abre e fecha grupos, recolhe e lembra', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A coluna é só do computador.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel/pedidos');
    const menu = page.getByRole('navigation', { name: 'Painel' }).first();
    await expect(menu.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page');

    // O grupo da página atual pode ser fechado; o conteúdo fechado sai do Tab.
    const vendas = menu.getByRole('button', { name: /^Vendas/ });
    await expect(vendas).toHaveAttribute('aria-expanded', 'true');
    await vendas.click();
    await expect(vendas).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => menu.getByRole('link', { name: /^Pedidos/ }).evaluate(el => !!el.closest('[inert]'))).toBe(true);
    await vendas.click();
    await page.reload();
    await expect(vendas).toHaveAttribute('aria-expanded', 'true');

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

    // Tocar num grupo na faixa abre a coluna com ele aberto.
    await menu.getByRole('button', { name: /^Clientes/ }).click();
    await expect.poll(largura).toBe(272);
    await expect(menu.getByRole('button', { name: /^Clientes/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('rodapé fica à vista mesmo com tudo aberto em tela baixa', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A coluna é só do computador.');
    await page.setViewportSize({ width: 1280, height: 560 });
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel');
    const menu = page.getByRole('navigation', { name: 'Painel' }).first();
    const fechados = menu.getByRole('button', { expanded: false });
    while (await fechados.count()) await fechados.first().click();
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
    await gaveta.getByRole('button', { name: /^Vendas/ }).click();
    await gaveta.getByRole('link', { name: /^Pedidos/ }).click();
    await expect(page).toHaveURL(/\/painel\/pedidos/);
    await expect(gaveta).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
