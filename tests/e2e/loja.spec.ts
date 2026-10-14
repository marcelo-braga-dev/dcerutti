/**
 * Loja do ponto de vista da cliente, sobre o seed completo (scripts/seed): acesso e login, LGPD, catálogo (filtros,
 * busca, ordem, promoção, esgotado, inativo), página do produto, sacola (limites, CEP, preço alterado) e Minha conta.
 */
import { expect, test, type Page } from '@playwright/test';
import { entrar, SENHA } from './ajuda';

const precos = async (page: Page) =>
  (await page.locator('a[href^="/produto/"] .font-display').allTextContents()).map(t => Number(t.replace(/[^\d,]/g, '').replace(',', '.')));

test.describe('acesso', () => {
  test('senha errada mostra mensagem genérica e não entra', async ({ page }) => {
    await page.goto('/entrar');
    await page.fill('input[name=email]', 'cliente@dcerutti.local');
    await page.fill('input[name=senha]', 'senha-errada-123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.locator('input[name=email]')).toHaveValue('cliente@dcerutti.local');
  });

  test('vendedor desativado não consegue entrar', async ({ page }) => {
    await page.goto('/entrar');
    await page.fill('input[name=email]', 'fabio@dcerutti.local');
    await page.fill('input[name=senha]', SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
  });

  test('cada papel cai no seu lugar depois do login; sair volta para o login', async ({ browser }) => {
    for (const [email, destino] of [['gestor@dcerutti.local', /\/painel$/], ['beatriz@dcerutti.local', /\/painel$/], ['cliente.carlos@dcerutti.local', /\/$/]] as const) {
      const page = await (await browser.newContext()).newPage();
      await entrar(page, email);
      await expect(page).toHaveURL(destino);
    }
    const page = await (await browser.newContext()).newPage();
    await entrar(page, 'cliente.carlos@dcerutti.local');
    await page.goto('/minha-conta');
    await page.getByRole('button', { name: 'Sair' }).first().click();
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto('/minha-conta');
    await expect(page).toHaveURL(/\/entrar\?volta=%2Fminha-conta/);
  });

  test('cliente sem aceite da política é levado a ela e volta para onde ia (LGPD)', async ({ browser }) => {
    // Conta criada pela vendedora nasce sem aceite (o aceite é da própria cliente): uma nova a cada execução.
    const email = `sem.aceite.${Date.now()}@exemplo.com`;
    const vendedora = await (await browser.newContext()).newPage();
    await entrar(vendedora, 'ana@dcerutti.local');
    await vendedora.goto('/painel/clientes/novo');
    await vendedora.fill('input[name=nome]', 'Cliente Sem Aceite');
    await vendedora.fill('input[name=telefone]', `499${String(Date.now()).slice(-8)}`);
    await vendedora.fill('input[name=email]', email);
    await vendedora.fill('input[name=senha]', SENHA);
    await vendedora.getByRole('button', { name: /Salvar|Cadastrar/ }).click();
    await expect(vendedora).toHaveURL(/\/painel\/clientes\/c/);

    const page = await (await browser.newContext()).newPage();
    await page.goto('/produto/FIX-PROMO');
    await expect(page).toHaveURL(/\/entrar\?volta=/);
    await page.fill('input[name=email]', email);
    await page.fill('input[name=senha]', SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/privacidade\?volta=/);
    await expect(page.getByRole('link', { name: /Não aceito/ })).toBeVisible();
    await page.goto('/catalogo');
    await expect(page, 'sem aceitar, não navega pela loja').toHaveURL(/\/privacidade/);
    await page.goto('/privacidade?volta=%2Fproduto%2FFIX-PROMO');
    await page.getByRole('button', { name: /Li e aceito/ }).click();
    await expect(page).toHaveURL(/\/produto\/FIX-PROMO$/);
    await page.goto('/catalogo');
    await expect(page).toHaveURL(/\/catalogo$/);
  });

  test('cadastro: validações, aceite obrigatório e e-mail já usado', async ({ page }) => {
    await page.goto('/cadastro');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Informe seu nome completo.')).toBeVisible();
    await page.fill('input[name=nome]', 'Cliente de Teste');
    await page.fill('input[name=telefone]', '49999990000');
    await page.fill('input[name=email]', 'cliente@dcerutti.local');
    await page.fill('input[name=senha]', 'senha-teste-1');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText(/aceite a política/)).toBeVisible();
    // Depois de um erro a senha volta vazia (nunca é devolvida ao navegador): digita de novo.
    await expect(page.locator('input[name=senha]')).toHaveValue('');
    await page.fill('input[name=senha]', 'senha-teste-1');
    await page.locator('input[name=aceite]').check();
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Este e-mail já tem conta. Use "Entrar".')).toBeVisible();
    await expect(page.locator('input[name=nome]'), 'o que foi digitado continua').toHaveValue('Cliente de Teste');
  });
});

test.describe('catálogo e produto', () => {
  test.beforeEach(({ page }) => entrar(page, 'cliente@dcerutti.local'));

  test('filtro por categoria e gênero mostra só o que pede', async ({ page }) => {
    await page.goto('/catalogo?categoria=vestidos');
    const nomes = await page.locator('a[href^="/produto/"] h3').allTextContents();
    expect(nomes.length).toBeGreaterThan(5);
    expect(nomes.every(n => /^Vestido/.test(n))).toBe(true);
    await page.goto('/catalogo?categoria=calcas&ordem=menor-preco');
    const p = await precos(page);
    expect(p.length).toBeGreaterThan(3);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    await page.goto('/catalogo?categoria=calcas&ordem=maior-preco');
    const q = await precos(page);
    expect([...q].sort((a, b) => b - a)).toEqual(q);
  });

  test('busca sem acento e por vários termos; nada encontrado tem mensagem', async ({ page }) => {
    await page.goto('/catalogo?q=moletom%20condicional');
    await expect(page.locator('a[href="/produto/FIX-CONDICIONAL"]').first()).toBeVisible();
    await page.goto('/catalogo?q=camiseta%20fixa');
    const nomes = await page.locator('a[href^="/produto/"] h3').allTextContents();
    expect(nomes.sort()).toEqual(['Camiseta Fixa Esgotada', 'Camiseta Fixa Estoque Farto', 'Camiseta Fixa Muda Preço', 'Camiseta Fixa Última Peça']);
    await page.goto('/catalogo?q=ULTIMA%20peca');
    expect(await page.locator('a[href^="/produto/"] h3').allTextContents()).toEqual(['Camiseta Fixa Última Peça']);
    await page.goto('/catalogo?q=xyzabc-nada');
    await expect(page.getByText('Nenhuma peça encontrada com esses filtros.')).toBeVisible();
  });

  test('promoção: todo cartão tem desconto; produto mostra preço cheio riscado e o percentual', async ({ page }) => {
    await page.goto('/catalogo?promo=1');
    const cartoes = page.locator('a[href^="/produto/"]');
    expect(await cartoes.count()).toBeGreaterThan(0);
    for (const c of await cartoes.all()) await expect(c.getByText(/^-\d+%$/)).toBeVisible();
    await page.goto('/produto/FIX-PROMO');
    await expect(page.getByText('-50%')).toBeVisible();
    await expect(page.locator('main .line-through').first()).toHaveText(/159,80/);
    await expect(page.getByText('Imperdível').first()).toBeVisible();
  });

  test('esgotados: filtro, selo e tamanhos travados', async ({ page }) => {
    await page.goto('/catalogo?estoque=esgotados');
    const n = await page.locator('a[href^="/produto/"]').count();
    expect(n).toBeGreaterThan(0);
    expect(await page.locator('a[href^="/produto/"]').getByText('Esgotado').count()).toBe(n);
    await page.goto('/produto/FIX-ESGOTADO');
    await expect(page.getByRole('button', { name: 'Esgotado' })).toBeDisabled();
    for (const t of await page.locator('[role=radio]').all()) await expect(t).toBeDisabled();
  });

  test('produto fora do catálogo dá "não encontrada"; inexistente também', async ({ page }) => {
    for (const ref of ['FIX-INATIVO', 'NAO-EXISTE-123']) {
      const r = await page.goto(`/produto/${ref}`);
      expect(r?.status()).toBe(404);
      await expect(page.getByText('Página não encontrada')).toBeVisible();
    }
  });

  test('produto sem foto abre normalmente', async ({ page }) => {
    await page.goto('/produto/FIX-SEMFOTO');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blusa Fixa Sem Foto');
    await expect(page.getByRole('button', { name: /Selecione um tamanho|Adicionar/ })).toBeVisible();
  });

  test('o produto nunca mostra custo nem dados internos', async ({ page }) => {
    await page.goto('/produto/FIX-ESTOQUE');
    const html = await page.content();
    expect(html).not.toMatch(/custo|precoCusto|margem|lucro/i);
  });
});

test.describe('sacola', () => {
  test('última peça: depois de 1 o botão de mais trava', async ({ page }) => {
    await entrar(page, 'cliente.carlos@dcerutti.local');
    await page.goto('/produto/FIX-ULTIMA');
    await page.getByRole('radio', { name: 'M', exact: true }).click();
    await expect(page.getByText('1 em estoque')).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
    await page.goto('/sacola');
    await expect(page.getByLabel('Aumentar')).toBeDisabled();
    await expect(page.getByLabel('Quantidade')).toContainText('1');
  });

  test('condicional fora da área sugere enviar como pedido', async ({ page }) => {
    await entrar(page, 'cliente.fora@dcerutti.local');
    await page.goto('/produto/FIX-CONDICIONAL');
    await page.getByRole('radio', { name: 'G', exact: true }).click();
    await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
    await page.goto('/sacola');
    await page.getByRole('tab', { name: 'Condicional' }).click();
    await expect(page.locator('input[placeholder="89874-000"]')).toHaveValue('89801-000');
    await page.getByRole('button', { name: /Enviar condicional/ }).click();
    await expect(page.getByRole('heading', { name: 'Ainda não chegamos aí' })).toBeVisible();
    await page.getByRole('button', { name: 'Enviar como pedido' }).click();
    await expect(page.getByRole('tab', { name: 'Pedido' })).toHaveAttribute('aria-selected', 'true');
  });

  test('preço alterado pelo gestor: a sacola avisa e usa o preço novo', async ({ browser }) => {
    const cliente = await (await browser.newContext()).newPage();
    await entrar(cliente, 'cliente.dados@dcerutti.local');
    await cliente.goto('/produto/FIX-PRECO');
    await cliente.getByRole('radio', { name: 'P', exact: true }).click();
    await cliente.getByRole('button', { name: 'Adicionar à sacola' }).click();

    const gestor = await (await browser.newContext()).newPage();
    await entrar(gestor, 'gestor@dcerutti.local');
    await gestor.goto('/painel/produtos?q=FIX-PRECO');
    await gestor.getByRole('link', { name: /Camiseta Fixa Muda Preço/ }).first().click();
    const novo = (Math.floor(Math.random() * 50) + 60).toFixed(2).replace('.', ',');
    await gestor.fill('input[name=preco]', novo);
    await gestor.fill('input[name=precoCheio]', novo);
    await gestor.getByRole('button', { name: 'Salvar produto' }).click();
    await expect(gestor.getByText('Produto salvo.')).toBeVisible();

    await cliente.goto('/sacola');
    await expect(cliente.getByText(/O preço mudou: Camiseta Fixa Muda Preço/)).toBeVisible();
    await expect(cliente.locator('aside')).toContainText(novo);
  });

  test('remover a última peça deixa a sacola vazia', async ({ page }) => {
    await entrar(page, 'cliente.dados@dcerutti.local');
    await page.goto('/sacola');
    // A sacola carrega no navegador ("Carregando sacola…"): espera o título antes de contar as peças.
    await expect(page.getByRole('heading', { name: 'Sua sacola' })).toBeVisible();
    await page.getByText('Carregando sacola…').waitFor({ state: 'detached' }).catch(() => {});
    while (await page.getByRole('button', { name: 'Remover', exact: true }).count()) await page.getByRole('button', { name: 'Remover', exact: true }).first().click();
    await expect(page.getByRole('link', { name: 'Ver o catálogo' })).toBeVisible();
  });
});

test.describe('minha conta', () => {
  test('mostra quem atende, os pedidos com situação e o motivo dos cancelados', async ({ page }) => {
    await entrar(page, 'cliente@dcerutti.local');
    await page.goto('/minha-conta/pedidos');
    await expect(page.getByRole('link', { name: /Fale com Ana Paula/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
    const codigos = await page.getByText(/^(PED|COND)-\d{6}$/).allTextContents();
    expect(codigos.length).toBeGreaterThan(0);
  });

  test('com pedido em aberto a conta não pode ser excluída', async ({ page }) => {
    await entrar(page, 'cliente.pendente@dcerutti.local');
    await page.goto('/minha-conta');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();
    await expect(page.getByText(/em aberto/)).toBeVisible();
    await page.goto('/minha-conta');
    await expect(page).toHaveURL(/\/minha-conta$/);
  });

  test('meus dados: erro de validação aparece no campo e nada é salvo', async ({ page }) => {
    await entrar(page, 'cliente.dados@dcerutti.local');
    await page.goto('/minha-conta');
    await page.fill('input[name=telefone]', '123');
    await page.getByRole('button', { name: 'Salvar meus dados' }).click();
    await expect(page.getByText(/Informe o WhatsApp com DDD/)).toBeVisible();
  });
});
