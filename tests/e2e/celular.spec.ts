import { expect, test } from '@playwright/test';
import { adicionarPeca, entrar } from './ajuda';

test('no celular as páginas da loja não têm rolagem horizontal (RNF-01)', async ({ page }) => {
  await entrar(page, 'cliente@dcerutti.local');
  for (const url of ['/', '/catalogo', '/sacola', '/minha-conta', '/minha-conta/pedidos']) {
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
  await page.getByRole('tab', { name: 'Condicional' }).click();
  expect(await sobra()).toBeLessThanOrEqual(1);
  // U-02: CEP do cadastro já vem preenchido.
  await expect(page.getByPlaceholder('89874-000')).toHaveValue('89874-000');
});

test('no celular há acesso à conta na loja e Sair no painel (B-02, B-03)', async ({ browser }) => {
  const opcoes = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const cliente = await (await browser.newContext(opcoes)).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  await cliente.getByRole('banner').getByRole('link', { name: 'Minha conta', exact: true }).click();
  await expect(cliente).toHaveURL(/\/minha-conta/);
  await cliente.getByRole('navigation', { name: 'Minha conta' }).getByRole('link', { name: 'Meus pedidos' }).click();
  await expect(cliente).toHaveURL(/\/minha-conta\/pedidos$/);

  const vendedora = await (await browser.newContext(opcoes)).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await expect(vendedora.getByRole('button', { name: 'Sair' }).first()).toBeVisible();
  await expect(vendedora.getByRole('link', { name: 'Ver loja' }).first()).toBeVisible();
});

test('no celular as páginas do painel não têm rolagem horizontal', async ({ page }) => {
  await entrar(page, 'gestor@dcerutti.local');
  for (const url of ['/painel', '/painel/pedidos', '/painel/clientes', '/painel/vendas', '/painel/produtos', '/painel/resultados', '/painel/vendedores', '/painel/configuracoes', '/painel/pedidos/novo']) {
    await page.goto(url);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(largura, url).toBeLessThanOrEqual(0);
  }
});

test('no celular a galeria desliza e o tamanho escolhido continua marcado (U-06, U-07)', async ({ page }) => {
  await entrar(page, 'cliente.carlos@dcerutti.local');
  // FIX-PROMO: 2 fotos que nenhum teste altera (o produto 1 tem as fotos mexidas pelo teste U-09).
  await page.goto('/produto/FIX-PROMO');
  const bolinhas = page.getByRole('button', { name: /^Foto \d$/ });
  expect(await bolinhas.count()).toBe(2);
  await bolinhas.last().click();
  await expect(bolinhas.last()).toHaveAttribute('aria-current', 'true');
  await expect(bolinhas.first()).toHaveAttribute('aria-current', 'false');
  await page.getByRole('radio', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await expect(page.getByRole('radio', { name: 'M', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('no celular a cliente envia um pedido do começo ao fim', async ({ page }) => {
  await entrar(page, 'cliente.dados@dcerutti.local');
  await page.goto('/produto/FIX-CONDICIONAL');
  await page.getByRole('radio', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await page.goto('/sacola');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Enviar pedido/ }).click();
  await (await popup).close();
  await expect(page.getByText('Pedido registrado', { exact: true })).toBeVisible();
  await expect(page.getByTestId('codigo-pedido')).toHaveText(/^PED-\d{6}$/);
});
