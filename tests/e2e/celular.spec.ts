import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

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
