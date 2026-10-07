import { expect, test } from '@playwright/test';
import { adicionarPeca, entrar } from './ajuda';

test('no celular as páginas da loja não têm rolagem horizontal (RNF-01)', async ({ page }) => {
  await entrar(page, 'cliente@dcerutti.local');
  for (const url of ['/', '/catalogo', '/sacola', '/minha-conta']) {
    await page.goto(url);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(largura, url).toBeLessThanOrEqual(0);
  }
  await page.goto('/catalogo');
  await page.getByText(/^Filtros/).click();
  await expect(page.getByRole('link', { name: /Feminino \(/ }).first()).toBeVisible();
});

test('sacola com peça não passa da borda em compra nem em condicional (B-01)', async ({ page }) => {
  await entrar(page, 'cliente@dcerutti.local');
  await adicionarPeca(page, 'camisetas');
  await page.goto('/sacola');
  const sobra = () => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('main *')].map(e => e.getBoundingClientRect().right - window.innerWidth)));
  expect(await sobra()).toBeLessThanOrEqual(1);
  await page.getByRole('tab', { name: 'Provar em casa' }).click();
  expect(await sobra()).toBeLessThanOrEqual(1);
  // U-02: CEP do cadastro já vem preenchido.
  await expect(page.getByPlaceholder('89874-000')).toHaveValue('89874-000');
});

test('no celular há acesso à conta na loja e Sair no painel (B-02, B-03)', async ({ browser }) => {
  const opcoes = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const cliente = await (await browser.newContext(opcoes)).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  await cliente.getByRole('link', { name: 'Conta', exact: true }).click();
  await expect(cliente).toHaveURL(/\/minha-conta/);

  const vendedora = await (await browser.newContext(opcoes)).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await expect(vendedora.getByRole('button', { name: 'Sair' }).first()).toBeVisible();
  await expect(vendedora.getByRole('link', { name: 'Ver loja' }).first()).toBeVisible();
});
