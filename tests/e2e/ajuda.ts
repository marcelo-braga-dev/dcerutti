import { expect, type Page } from '@playwright/test';

export const SENHA = process.env.SEED_SENHA || 'dcerutti123';

export async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=senha]', SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

/** Abre um produto disponível da categoria e devolve a referência e o estoque do tamanho escolhido. */
export async function adicionarPeca(page: Page, categoria: string) {
  await page.goto(`/catalogo?estoque=disponiveis&categoria=${categoria}`);
  await page.locator('a[href^="/produto/"]').first().click();
  await expect(page).toHaveURL(/\/produto\//);
  const referencia = decodeURIComponent(page.url().split('/produto/')[1]);
  const tamanho = page.locator('[role=radio]:not([disabled])').first();
  const nomeTamanho = (await tamanho.textContent())!.trim();
  await tamanho.click();
  const estoque = Number((await page.getByText(/em estoque$/).textContent())!.match(/\d+/)![0]);
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await expect(page.getByText('adicionado à sacola')).toBeVisible();
  return { referencia, tamanho: nomeTamanho, estoque };
}

/** Estoque disponível exibido na página do produto para um tamanho (0 se esgotado). */
export async function estoqueNaLoja(page: Page, referencia: string, tamanho: string) {
  await page.goto(`/produto/${referencia}`);
  const botao = page.getByRole('radio', { name: tamanho, exact: true });
  if (await botao.isDisabled()) return 0;
  await botao.click();
  return Number((await page.getByText(/em estoque$/).textContent())!.match(/\d+/)![0]);
}

export async function enviarDaSacola(page: Page, botao: RegExp) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: botao }).click();
  const aba = await popup;
  await aba.close();
  const codigo = await page.getByText(/(Pedido|Condicional) enviado · /).textContent();
  return codigo!.split('· ')[1].trim();
}
