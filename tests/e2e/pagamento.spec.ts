/**
 * Pagamento online (docs/27, docs/28 R-11) com o Mercado Pago simulado (PAGAMENTO_GATEWAY=falso no servidor):
 * a vendedora gera o link, a cliente paga o Pix sem entrar na conta e o pedido aparece pago no painel e em Minha conta.
 */
import { expect, test, type Page } from '@playwright/test';
import { adicionarPeca, entrar, enviarDaSacola } from './ajuda';

test.describe.configure({ mode: 'serial' });

async function pagamentoOnline(page: Page, ligado: boolean) {
  await page.goto('/painel/configuracoes');
  await page.locator('input[name=pgLigado]').setChecked(ligado);
  await page.locator('input[name=pgPix]').setChecked(true);
  await page.locator('input[name=pgCartao]').setChecked(true);
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByText('Configurações salvas.')).toBeVisible();
}

test('link de pagamento: a vendedora gera, a cliente paga o Pix e o pedido fica pago e confirmado', async ({ browser }) => {
  const gestor = await (await browser.newContext()).newPage();
  await entrar(gestor, 'gestor@dcerutti.local');
  await pagamentoOnline(gestor, true);
  try {
    const cliente = await (await browser.newContext()).newPage();
    await entrar(cliente, 'cliente@dcerutti.local');
    await adicionarPeca(cliente, 'camisetas');
    await cliente.goto('/sacola');
    const codigo = await enviarDaSacola(cliente, /Enviar pedido no WhatsApp/);

    const vendedora = await (await browser.newContext()).newPage();
    await entrar(vendedora, 'ana@dcerutti.local');
    await vendedora.goto(`/painel/pedidos?q=${codigo}`);
    await vendedora.getByRole('link', { name: new RegExp(codigo) }).first().click();
    await expect(vendedora.getByRole('heading', { name: 'Pagamento online' })).toBeVisible();
    // Frete a combinar: a vendedora informa (0 = retirada) para liberar a cobrança.
    const salvarFrete = vendedora.getByRole('button', { name: 'Salvar frete' });
    if (await salvarFrete.isVisible()) {
      await vendedora.getByPlaceholder('0,00').fill('0');
      await salvarFrete.click();
      await expect(vendedora.getByText('Frete salvo.')).toBeVisible();
    }
    await vendedora.getByRole('button', { name: 'Gerar link de pagamento' }).click();
    const link = (await vendedora.locator('code', { hasText: '/pagar/' }).textContent())!.trim();
    expect(link).toMatch(new RegExp(`/pagar/${codigo}\\.[\\w-]{16}$`));

    // A cliente abre o link sem estar logada (outro navegador).
    const anonima = await (await browser.newContext()).newPage();
    await anonima.goto(new URL(link).pathname);
    await expect(anonima.getByText('Total a pagar')).toBeVisible();
    // A ficha da cliente tem e-mail: o Pix sai direto, sem perguntar.
    await anonima.getByRole('button', { name: /Pagar com Pix/ }).click();
    await expect(anonima.getByRole('img', { name: 'QR Code do Pix' })).toBeVisible();
    await expect(anonima.getByRole('button', { name: 'Copiar código Pix' })).toBeVisible();
    await anonima.getByRole('button', { name: 'Simular pagamento aprovado' }).click();
    await expect(anonima.getByRole('heading', { name: 'Pagamento aprovado' })).toBeVisible();

    await vendedora.reload();
    await expect(vendedora.getByText('Pago', { exact: true }).first()).toBeVisible();
    await expect(vendedora.getByText(/Venda registrada/)).toBeVisible();

    await cliente.goto('/minha-conta/pedidos');
    await expect(cliente.locator('article', { hasText: codigo }).getByText('Pago', { exact: true })).toBeVisible();

    await gestor.goto('/painel/pagamentos');
    await expect(gestor.getByRole('link', { name: codigo })).toBeVisible();
  } finally {
    await pagamentoOnline(gestor, false);
  }
});
