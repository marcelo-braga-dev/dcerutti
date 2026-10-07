import { expect, test, type Page } from '@playwright/test';
import { entrar } from './ajuda';

test.describe.configure({ mode: 'serial' });

/** Abre a página e confere que carregou de verdade: sem tela de erro e com o título esperado. */
async function abrir(page: Page, url: string, titulo: RegExp) {
  const r = await page.goto(url);
  expect(r?.status(), url).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: 'Algo deu errado' }), url).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: titulo }).first(), url).toBeVisible();
}

/** Primeiro link de detalhe de uma lista (ex.: /painel/clientes/<id>). */
async function primeiroDetalhe(page: Page, lista: string, prefixo: string) {
  await page.goto(lista);
  const href = await page.locator(`a[href^="${prefixo}"]`).evaluateAll((as, p) =>
    as.map(a => a.getAttribute('href')!).find(h => h.length > p.length && !h.endsWith('/novo')), prefixo);
  expect(href, `nenhum detalhe em ${lista}`).toBeTruthy();
  return href!;
}

test('gestor abre todas as páginas do painel (camada consultas/)', async ({ browser }) => {
  const gestor = await (await browser.newContext()).newPage();
  await entrar(gestor, 'gestor@dcerutti.local');
  await abrir(gestor, '/painel', /Resumo da equipe/);
  await abrir(gestor, '/painel/pedidos?status=todos', /Pedidos/);
  await abrir(gestor, '/painel/pedidos/novo', /Novo pedido/);
  await abrir(gestor, '/painel/clientes', /Todos os clientes/);
  await abrir(gestor, '/painel/clientes/novo', /Cadastrar cliente/);
  await abrir(gestor, '/painel/vendas', /Vendas/);
  await abrir(gestor, '/painel/resultados', /Resultados e lucro/);
  await abrir(gestor, '/painel/resultados?periodo=tudo', /Resultados e lucro/);
  await abrir(gestor, '/painel/produtos', /Produtos e custos/);
  await abrir(gestor, '/painel/produtos?filtro=sem-foto', /Produtos e custos/);
  await abrir(gestor, '/painel/produtos/novo', /Cadastrar produto/);
  await abrir(gestor, '/painel/vendedores', /Vendedores/);
  await abrir(gestor, '/painel/vendedores/novo', /Novo vendedor|Cadastrar vendedor/);
  await abrir(gestor, '/painel/configuracoes', /Configurações/);

  await abrir(gestor, await primeiroDetalhe(gestor, '/painel/clientes', '/painel/clientes/'), /.+/);
  await abrir(gestor, await primeiroDetalhe(gestor, '/painel/produtos', '/painel/produtos/'), /.+/);
  await abrir(gestor, await primeiroDetalhe(gestor, '/painel/vendedores', '/painel/vendedores/'), /.+/);
  await abrir(gestor, await primeiroDetalhe(gestor, '/painel/pedidos?status=todos', '/painel/pedidos/'), /^(PED|COND)-/);
});

test('novo pedido busca peças no servidor', async ({ browser }) => {
  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto('/painel/pedidos/novo');
  await vendedora.getByPlaceholder('Nome, referência ou categoria…').fill('camiseta');
  await expect(vendedora.locator('text=/Ref\\. /').first()).toBeVisible();
  await expect(vendedora.getByText('Nenhuma peça encontrada.')).toHaveCount(0);
});

test('vendedora não enxerga cliente de outro vendedor, nem pela URL', async ({ browser }) => {
  const gestor = await (await browser.newContext()).newPage();
  await entrar(gestor, 'gestor@dcerutti.local');
  await gestor.goto('/painel/clientes?q=Roberto');
  const fichaDoCarlos = await gestor.getByRole('link', { name: 'Roberto Lima' }).first().getAttribute('href');
  expect(fichaDoCarlos).toMatch(/^\/painel\/clientes\//);

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  await vendedora.goto('/painel/clientes');
  await expect(vendedora.getByRole('link', { name: 'Roberto Lima' })).toHaveCount(0);
  // Com loading.tsx o Next já começou a enviar a página, então o status fica 200; o que importa é o conteúdo.
  await vendedora.goto(fichaDoCarlos!);
  await expect(vendedora.getByRole('heading', { level: 1, name: 'Não encontrado' })).toBeVisible();
  await expect(vendedora.getByText('Roberto Lima')).toHaveCount(0);
});

test('LGPD: política pública e exclusão da própria conta anonimiza os dados', async ({ browser }) => {
  const visitante = await (await browser.newContext()).newPage();
  await visitante.goto('/privacidade');
  await expect(visitante.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeVisible();

  // Cria uma conta descartável pelo convite e a exclui pela própria "Minha conta".
  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, 'ana@dcerutti.local');
  const link = (await vendedora.locator('code').textContent())!;
  const nova = await (await browser.newContext()).newPage();
  await nova.goto(new URL(link).pathname + new URL(link).search);
  const email = `excluir.${Date.now()}@exemplo.com`;
  await nova.fill('input[name=nome]', 'Pessoa Para Excluir');
  await nova.fill('input[name=telefone]', '49991112222');
  await nova.fill('input[name=email]', email);
  await nova.fill('input[name=senha]', 'segredo123');
  await nova.getByLabel('Li e aceito a política de privacidade').check();
  await nova.getByRole('button', { name: 'Criar conta' }).click();
  await expect(nova).toHaveURL(/\/$/);

  await nova.goto('/minha-conta');
  nova.once('dialog', d => d.accept());
  await nova.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(nova).toHaveURL(/\/entrar/);
  await nova.goto('/minha-conta');
  await expect(nova).toHaveURL(/\/entrar/);

  await vendedora.goto('/painel/clientes?q=Pessoa Para Excluir');
  await expect(vendedora.getByText('Pessoa Para Excluir')).toHaveCount(0);
});
