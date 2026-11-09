/** Pós-venda (docs/26): consentimento na conta, situação do pedido, fila de hoje e indicadores. */
import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

test.describe('Pós-venda', () => {
  test('a cliente aceita e sai das ofertas em Minha conta', async ({ page }) => {
    await entrar(page, 'cliente.dados@dcerutti.local');
    await page.goto('/minha-conta');
    const caixa = page.locator('input[name=aceitaOfertas]');
    await caixa.check();
    await page.getByRole('button', { name: /Salvar/ }).first().click();
    await expect(page.getByText('Dados atualizados.')).toBeVisible();
    await page.reload();
    await expect(caixa).toBeChecked();
    await caixa.uncheck();
    await page.getByRole('button', { name: /Salvar/ }).first().click();
    await expect(page.getByText('Dados atualizados.')).toBeVisible();
    await page.reload();
    await expect(caixa).not.toBeChecked();
  });

  test('situação do pedido e venda que aparece no pós-venda quando vence o prazo', async ({ page }) => {
    await entrar(page, 'ana@dcerutti.local');
    await page.goto('/painel/pedidos?status=pendente');
    await page.locator('a[href^="/painel/pedidos/c"]').first().click();
    await expect(page.getByRole('heading', { name: 'Pagamento e entrega' })).toBeVisible();
    await page.selectOption('select[name=pagamento]', 'pago');
    await page.selectOption('select[name=entrega]', 'separando');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Situação salva.')).toBeVisible();
    await page.reload();
    await expect(page.locator('select[name=pagamento]')).toHaveValue('pago');
  });

  test('a gestão vê os indicadores e configura os dias', async ({ page }) => {
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel/resultados');
    await expect(page.getByRole('heading', { name: 'Atendimento' })).toBeVisible();
    await page.goto('/painel/atendimento/equipe');
    await expect(page.getByRole('columnheader', { name: /Conversão/ })).toBeVisible();
    await page.goto('/painel/configuracoes');
    await expect(page.locator('input[name=diasEntrega]')).toHaveValue('1');
    await page.goto('/privacidade');
    await expect(page.getByText(/Instagram/).first()).toBeVisible();
  });
});
