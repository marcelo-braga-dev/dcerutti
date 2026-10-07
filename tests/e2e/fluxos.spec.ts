import { expect, test } from '@playwright/test';
import { adicionarPeca, entrar, enviarDaSacola, estoqueNaLoja, SENHA } from './ajuda';

test.describe.configure({ mode: 'serial' });

test('pedido de compra: cliente envia, vendedora confirma e o estoque baixa (RN-07)', async ({ browser }) => {
  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  const peca = await adicionarPeca(cliente, 'camisetas');
  await cliente.goto('/sacola');
  const codigo = await enviarDaSacola(cliente, /Enviar pedido no WhatsApp/);
  expect(codigo).toMatch(/^PED-\d{6}$/);
  // Compra não reserva: o estoque só muda na confirmação.
  expect(await estoqueNaLoja(cliente, peca.referencia, peca.tamanho)).toBe(peca.estoque);

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto('/painel/pedidos');
  await vendedora.getByRole('link', { name: new RegExp(codigo) }).click();
  await vendedora.getByRole('button', { name: /Confirmar venda/ }).click();
  await expect(vendedora.getByText('Venda registrada')).toBeVisible();

  expect(await estoqueNaLoja(cliente, peca.referencia, peca.tamanho)).toBe(peca.estoque - 1);
  await cliente.goto('/minha-conta');
  await expect(cliente.getByText(codigo).locator('..')).toContainText('Confirmado');
});

test('condicional: reserva ao enviar e devolve ao estoque o que voltou (RN-08)', async ({ browser }) => {
  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  const peca = await adicionarPeca(cliente, 'blusas');
  await cliente.goto('/sacola');
  await cliente.getByRole('tab', { name: 'Provar em casa' }).click();

  await cliente.fill('input[placeholder="89874-000"]', '88000-000');
  await cliente.getByRole('button', { name: /Enviar condicional/ }).click();
  await expect(cliente.getByText('Ainda não chegamos aí')).toBeVisible();
  await cliente.getByRole('button', { name: 'Voltar' }).click();

  await cliente.fill('input[placeholder="89874-000"]', '89874000');
  const codigo = await enviarDaSacola(cliente, /Enviar condicional/);
  expect(codigo).toMatch(/^COND-\d{6}$/);
  expect(await estoqueNaLoja(cliente, peca.referencia, peca.tamanho)).toBe(peca.estoque - 1);

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto('/painel/pedidos');
  await vendedora.getByRole('link', { name: new RegExp(codigo) }).click();
  const fechar = vendedora.getByRole('button', { name: /Fechar condicional/ });
  await expect(fechar).toBeDisabled();
  await vendedora.getByRole('button', { name: 'Voltou tudo' }).click();
  await fechar.click();
  await expect(vendedora.getByText('Confirmado', { exact: true })).toBeVisible();

  expect(await estoqueNaLoja(cliente, peca.referencia, peca.tamanho)).toBe(peca.estoque);
});

test('cancelar condicional libera a reserva (RN-09)', async ({ browser }) => {
  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  const peca = await adicionarPeca(cliente, 'calcas');
  await cliente.goto('/sacola');
  await cliente.getByRole('tab', { name: 'Provar em casa' }).click();
  await cliente.fill('input[placeholder="89874-000"]', '89874-000');
  const codigo = await enviarDaSacola(cliente, /Enviar condicional/);

  const gestor = await (await browser.newContext()).newPage();
  await entrar(gestor, 'gestor@dcerutti.local');
  await gestor.goto('/painel/pedidos');
  await gestor.getByRole('link', { name: new RegExp(codigo) }).click();
  gestor.once('dialog', d => d.accept());
  await gestor.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(gestor.getByText('Cancelado', { exact: true })).toBeVisible();
  expect(await estoqueNaLoja(cliente, peca.referencia, peca.tamanho)).toBe(peca.estoque);
});

test('permissões: visitante, cliente e vendedor só entram onde podem', async ({ browser }) => {
  const visitante = await (await browser.newContext()).newPage();
  for (const url of ['/', '/catalogo', '/painel', '/minha-conta']) {
    await visitante.goto(url);
    await expect(visitante).toHaveURL(/\/entrar/);
  }

  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  await cliente.goto('/painel');
  await expect(cliente).toHaveURL(/\/$/);

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  for (const url of ['/painel/produtos', '/painel/resultados', '/painel/vendedores', '/painel/configuracoes']) {
    await vendedora.goto(url);
    await expect(vendedora).toHaveURL(/\/painel$/);
  }
  // RN-16: nenhum custo aparece para quem não é gestor.
  await vendedora.goto('/painel/pedidos/novo');
  expect(await vendedora.content()).not.toMatch(/custo/i);
});

test('cadastro de cliente pelo link de convite vincula à vendedora', async ({ browser }) => {
  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  const link = await vendedora.locator('code').textContent();
  expect(link).toContain('/cadastro?v=');

  const nova = await (await browser.newContext()).newPage();
  await nova.goto(new URL(link!).pathname + new URL(link!).search);
  await expect(nova.getByText('Convite de Ana')).toBeVisible();
  await nova.getByRole('button', { name: 'Criar conta' }).click();
  await expect(nova.getByText('Informe seu nome completo.')).toBeVisible();

  const email = `teste.${Date.now()}@exemplo.com`;
  await nova.fill('input[name=nome]', 'Cliente de Teste');
  await nova.fill('input[name=telefone]', '49991234567');
  await expect(nova.locator('input[name=telefone]')).toHaveValue('(49) 99123-4567');
  await nova.fill('input[name=email]', email);
  await nova.fill('input[name=senha]', 'segredo123');
  // LGPD: sem o aceite a conta não é criada.
  await nova.getByRole('button', { name: 'Criar conta' }).click();
  await expect(nova.getByText('aceite a política de privacidade')).toBeVisible();
  await nova.getByLabel('Li e aceito a política de privacidade').check();
  await nova.fill('input[name=senha]', 'segredo123'); // senha nunca volta preenchida depois de um erro
  await nova.getByRole('button', { name: 'Criar conta' }).click();
  await expect(nova).toHaveURL(/\/$/);

  await vendedora.goto('/painel/clientes?q=Cliente de Teste');
  await expect(vendedora.getByText('Cliente de Teste').first()).toBeVisible();
});

test('link de produto aberto sem login volta ao produto depois de entrar (B-04)', async ({ page }) => {
  await page.goto('/catalogo?genero=feminino&estoque=disponiveis');
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fcatalogo%3Fgenero%3Dfeminino/);
  await page.fill('input[name=email]', 'cliente@dcerutti.local');
  await page.fill('input[name=senha]', SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/catalogo\?genero=feminino&estoque=disponiveis$/);
});

test('sacola não passa do estoque disponível (B-05)', async ({ page }) => {
  await entrar(page, 'cliente@dcerutti.local');
  const peca = await adicionarPeca(page, 'camisetas');
  for (let i = 1; i < peca.estoque; i++) await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await expect(page.getByText(/já tem na sacola todas as/)).toBeVisible();
  await page.goto('/sacola');
  await expect(page.getByRole('button', { name: 'Aumentar' }).first()).toBeDisabled();
});
