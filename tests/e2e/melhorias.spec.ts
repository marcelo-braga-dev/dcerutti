import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { entrar, enviarDaSacola, estoqueNaLoja } from './ajuda';

test.describe.configure({ mode: 'serial' });

/** Põe na sacola 2 unidades de um tamanho que tenha pelo menos 2 disponíveis. */
async function duasUnidades(page: Page) {
  await page.goto('/catalogo?estoque=disponiveis&categoria=camisetas');
  const links = await page.locator('a[href^="/produto/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')!))].slice(0, 25));
  for (const href of links) {
    await page.goto(href);
    for (const t of await page.locator('[role=radio]:not([disabled])').all()) {
      await t.click();
      const estoque = Number((await page.getByText(/em estoque$/).textContent())!.match(/\d+/)![0]);
      if (estoque >= 2) {
        const tamanho = (await t.textContent())!.trim();
        await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
        await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
        return { referencia: decodeURIComponent(href.split('/produto/')[1]), tamanho, estoque };
      }
    }
  }
  throw new Error('nenhum tamanho com 2 unidades');
}

test('condicional fechado com parte das unidades (B-13)', async ({ browser }) => {
  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  const peca = await duasUnidades(cliente);
  await cliente.goto('/sacola');
  await cliente.getByRole('tab', { name: 'Condicional' }).click();
  const codigo = await enviarDaSacola(cliente, /Enviar condicional/);

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto(`/painel/pedidos?q=${codigo}`);
  await vendedora.getByRole('link', { name: new RegExp(codigo) }).click();
  await vendedora.getByLabel(/Unidades de .* que ficaram/).selectOption('1');
  await vendedora.getByRole('button', { name: /Fechar condicional/ }).click();
  await expect(vendedora.getByText('Ficou', { exact: true })).toBeVisible();
  await expect(vendedora.getByText('Voltou', { exact: true })).toBeVisible();

  // Saiu 1 do estoque; a outra unidade voltou a ficar disponível.
  expect(await estoqueNaLoja(cliente, peca.referencia, peca.tamanho)).toBe(peca.estoque - 1);
});

test('cliente edita os próprios dados e cancela um pedido em aberto (U-04, U-05)', async ({ page }) => {
  await entrar(page, 'cliente@dcerutti.local');
  await page.goto('/minha-conta');
  await page.fill('input[name=endereco]', `Rua das Flores, ${Date.now() % 1000}`);
  await page.getByRole('button', { name: 'Salvar meus dados' }).click();
  await expect(page.getByText('Dados atualizados.')).toBeVisible();

  await page.goto('/catalogo?estoque=disponiveis&categoria=camisetas');
  await page.locator('a[href^="/produto/"]').first().click();
  await page.locator('[role=radio]:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await page.goto('/sacola');
  const codigo = await enviarDaSacola(page, /Enviar pedido/);
  await page.goto('/minha-conta/pedidos');
  const cartao = page.locator('article', { hasText: codigo });
  page.once('dialog', d => d.accept());
  await cartao.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(cartao).toContainText('Cancelado');
});

test('vendedora monta um condicional para a cliente (U-08)', async ({ page }) => {
  await entrar(page, 'ana@dcerutti.local');
  await page.goto('/painel/pedidos/novo');
  await page.selectOption('select', { label: 'Mariana Souza · (49) 99912-3456' });
  await page.locator('button.min-w-9').first().click();
  await page.getByRole('button', { name: 'Condicional', exact: true }).click();
  await page.getByRole('button', { name: 'Só salvar' }).click();
  await page.waitForURL(/\/painel\/pedidos\/c/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^COND-/);
});

test('gestor reordena e remove fotos do produto (U-09)', async ({ page }) => {
  await entrar(page, 'gestor@dcerutti.local');
  await page.goto('/painel/produtos/1');
  const fotos = () => page.locator('input[name=imagens]').inputValue().then(v => v.split('\n').filter(Boolean));
  // Garante pelo menos 2 fotos (o próprio teste remove uma a cada execução).
  for (let n = (await fotos()).length; n < 2; n++) {
    await page.getByLabel('Endereço de foto').fill(`https://exemplo.com/teste-${Date.now()}-${n}.jpg`);
    await page.getByLabel('Endereço de foto').locator('xpath=following-sibling::button[1]').click();
  }
  const antes = await fotos();
  await page.getByRole('button', { name: 'Mover foto 1 para depois' }).click();
  expect((await fotos()).slice(0, 2)).toEqual([antes[1], antes[0]]);
  await page.getByRole('button', { name: 'Remover foto 2' }).click();
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText('Produto salvo.')).toBeVisible();
  await page.reload();
  expect(await fotos()).toEqual([antes[1], ...antes.slice(2)]);
});

test('sem regra de frete, a sacola mostra frete a combinar e não promete parcelas (C-03)', async ({ page }) => {
  await entrar(page, 'cliente@dcerutti.local');
  await page.goto('/catalogo?estoque=disponiveis&categoria=camisetas');
  await page.locator('a[href^="/produto/"]').first().click();
  await expect(page.getByText(/ou \d+x de/)).toHaveCount(0);
  await page.locator('[role=radio]:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await page.goto('/sacola');
  await expect(page.getByText('A combinar')).toBeVisible();
  await expect(page.getByText(/para o frete grátis/)).toHaveCount(0);
});

test('venda na loja com peças baixa o estoque e entra confirmada (Q-04)', async ({ browser }) => {
  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto('/painel/pedidos/novo?tipo=balcao');
  await vendedora.selectOption('select', { label: 'Mariana Souza · (49) 99912-3456' });
  const cartao = vendedora.locator('button.min-w-9').first().locator('xpath=ancestor::div[contains(@class,"grid-cols-[64px_1fr]")][1]');
  const referencia = (await cartao.getByText(/Ref\. /).textContent())!.match(/Ref\. (\S+)/)![1];
  const tamanho = (await vendedora.locator('button.min-w-9').first().textContent())!.trim();

  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  const antes = await estoqueNaLoja(cliente, referencia, tamanho);

  await vendedora.locator('button.min-w-9').first().click();
  await vendedora.getByRole('button', { name: /Registrar venda/ }).click();
  await vendedora.waitForURL(/\/painel\/pedidos\/c/);
  await expect(vendedora.getByText('Venda na loja')).toBeVisible();
  await expect(vendedora.getByText('Confirmado', { exact: true })).toBeVisible();
  expect(await estoqueNaLoja(cliente, referencia, tamanho)).toBe(antes - 1);
});

test('vendedora edita as peças de um condicional pendente e a reserva acompanha (U-08)', async ({ browser }) => {
  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto('/painel/pedidos/novo?tipo=condicional');
  await vendedora.selectOption('select', { label: 'Mariana Souza · (49) 99912-3456' });
  // Dois tamanhos diferentes (o banco de teste tem quase tudo com 1 unidade por tamanho).
  const tamanhos = vendedora.locator('button.min-w-9:not([disabled])');
  const pecas: { referencia: string; tamanho: string }[] = [];
  for (const i of [0, 1]) {
    const b = tamanhos.nth(i);
    const cartao = b.locator('xpath=ancestor::div[contains(@class,"grid-cols-[64px_1fr]")][1]');
    pecas.push({
      referencia: (await cartao.getByText(/Ref\. /).textContent())!.match(/Ref\. (\S+)/)![1],
      tamanho: (await b.textContent())!.trim(),
    });
  }
  const cliente = await (await browser.newContext()).newPage();
  await entrar(cliente, 'cliente@dcerutti.local');
  const antes = await estoqueNaLoja(cliente, pecas[1].referencia, pecas[1].tamanho);

  await tamanhos.nth(0).click();
  await tamanhos.nth(1).click();
  await vendedora.getByRole('button', { name: 'Só salvar' }).click();
  await vendedora.waitForURL(/\/painel\/pedidos\/c/);
  expect(await estoqueNaLoja(cliente, pecas[1].referencia, pecas[1].tamanho)).toBe(antes - 1);

  // Retira a segunda peça: a reserva dela volta para a loja.
  await vendedora.getByRole('button', { name: 'Editar peças' }).click();
  await vendedora.getByRole('button', { name: 'Retirar' }).nth(1).click();
  await vendedora.getByRole('button', { name: /Salvar alterações/ }).click();
  await expect(vendedora.getByRole('button', { name: 'Editar peças' })).toBeVisible();
  expect(await estoqueNaLoja(cliente, pecas[1].referencia, pecas[1].tamanho)).toBe(antes);

  // Não deixa o pedido sem peças.
  await vendedora.getByRole('button', { name: 'Editar peças' }).click();
  await vendedora.getByRole('button', { name: 'Retirar' }).click();
  await vendedora.getByRole('button', { name: /Salvar alterações/ }).click();
  await expect(vendedora.getByText(/pelo menos uma peça/)).toBeVisible();
});

test('pedido novo e cancelamento avisam o vendedor por e-mail (L-13)', async ({ page }) => {
  const LOG = process.env.E2E_LOG_SERVIDOR;
  test.skip(!LOG, 'defina E2E_LOG_SERVIDOR com o log do servidor de teste');
  const antes = readFileSync(LOG!, 'utf8').length;
  await entrar(page, 'cliente@dcerutti.local');
  await page.goto('/catalogo?estoque=disponiveis&categoria=camisetas');
  await page.locator('a[href^="/produto/"]').first().click();
  await page.locator('[role=radio]:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
  await page.goto('/sacola');
  const codigo = await enviarDaSacola(page, /Enviar pedido/);
  const novoLog = () => readFileSync(LOG!, 'utf8').slice(antes);
  await expect.poll(novoLog).toContain(`Pedido novo ${codigo}`);
  expect(novoLog()).toMatch(new RegExp(`/painel/pedidos/c\\w+`));

  await page.goto('/minha-conta/pedidos');
  const cartao = page.locator('article', { hasText: codigo });
  page.once('dialog', d => d.accept());
  await cartao.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect.poll(novoLog).toContain(`Pedido ${codigo} cancelado pela cliente`);
});
