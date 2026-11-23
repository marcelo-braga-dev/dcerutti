/** Vitrines (docs/26): criar e publicar, página aberta com preço especial, pedido, /live e o que fica escondido. */
import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

const celular = () => { const d = String(Date.now()).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };

test.describe('Vitrines', () => {
  test('criar, publicar, abrir sem login, pedir e ver no resultado', async ({ browser }) => {
    const ana = await (await browser.newContext()).newPage();
    await entrar(ana, 'ana@dcerutti.local');
    const titulo = `Inverno ${Date.now().toString(36)}`;
    await ana.goto('/painel/vitrines/nova');
    await ana.selectOption('select[name=tipo]', 'post');
    await ana.fill('input[name=titulo]', titulo);
    await ana.fill('input[name=urlInstagram]', 'https://falso.com/x');
    await ana.getByRole('button', { name: 'Criar vitrine' }).click();
    await expect(ana.getByText(/Use um link do Instagram/)).toBeVisible();
    await ana.fill('input[name=urlInstagram]', 'https://www.instagram.com/p/teste/');
    await ana.getByRole('button', { name: 'Criar vitrine' }).click();
    await expect(ana).toHaveURL(/\/painel\/vitrines\/[a-z0-9]+$/);
    await expect(ana.getByText('Adicione pelo menos uma peça.')).toBeVisible();

    await ana.getByLabel('Buscar peça para a vitrine').fill('FIX-ESTOQUE');
    await ana.getByRole('button', { name: 'Buscar', exact: true }).click();
    await ana.getByRole('button', { name: /^Adicionar / }).first().click();
    const oferta = ana.getByRole('textbox', { name: /^Preço especial de / });
    await expect(oferta).toBeVisible();
    await oferta.fill('55,00');
    await ana.getByRole('button', { name: 'Salvar', exact: true }).first().click();
    await expect(oferta).toHaveValue('55');

    const caminho = new URL((await ana.getByText(/\/vitrine\//).first().textContent())!.trim()).pathname;
    const visitante = await (await browser.newContext()).newPage();
    expect((await visitante.goto(caminho))?.status()).toBe(404);

    await ana.getByRole('button', { name: 'Publicar' }).click();
    await expect(ana.getByText('Publicada').first()).toBeVisible();

    expect((await visitante.goto(caminho))?.status()).toBe(200);
    await expect(visitante.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(visitante.getByText('R$ 55,00').first()).toBeVisible();
    await expect(visitante.getByRole('link', { name: 'Ver no Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/p/teste/');
    expect(await visitante.content()).toContain('noindex');

    await visitante.goto('/vitrines');
    await expect(visitante.getByRole('link', { name: new RegExp(titulo) })).toBeVisible();
    await visitante.getByRole('link', { name: new RegExp(titulo) }).click();

    const nome = `Da Vitrine ${Date.now().toString(36)}`;
    // D-36: escolher o tamanho, a barra fixa mostra o total e abre a gaveta do pedido.
    await expect(visitante.getByRole('button', { name: 'Quero estas peças' })).toBeDisabled();
    await visitante.getByRole('button', { name: /tamanho G$/ }).first().click();
    await expect(visitante.getByText(/^1 peça · R\$\s55,00$/)).toBeVisible();
    await visitante.getByRole('button', { name: 'Quero estas peças' }).click();
    const gaveta = visitante.getByRole('dialog', { name: 'Seu pedido' });
    await expect(gaveta.getByText('Tam.')).toBeVisible();
    await gaveta.getByLabel('Seu nome').fill(nome);
    await gaveta.getByLabel('Seu WhatsApp').fill(celular());
    await gaveta.getByRole('checkbox', { name: /^Aceito/ }).check();
    await gaveta.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' }).click();
    await expect(visitante.getByRole('heading', { name: 'Pedido recebido!' })).toBeVisible();

    await ana.reload();
    await expect(ana.getByRole('region', { name: 'Resultado' }).getByText('Atendimentos', { exact: true })).toBeVisible();
    await ana.getByRole('link', { name: 'Ver os atendimentos' }).click();
    await ana.getByRole('link', { name: nome }).first().click();
    await expect(ana.getByRole('link', { name: titulo })).toBeVisible();
    await expect(ana.getByText('R$ 55,00').first()).toBeVisible();
  });

  test('rascunho, encerrada, /live e o resto do catálogo', async ({ page }) => {
    expect((await page.goto('/vitrine/rascunho-de-teste'))?.status()).toBe(404);
    expect((await page.goto('/vitrine/nao-existe'))?.status()).toBe(404);
    await page.goto('/vitrine/encerrada-de-teste');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Falar com/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quero estas peças' })).toHaveCount(0);
    await page.goto('/live');
    await expect(page).toHaveURL(/\/vitrine\//);
    await page.goto('/catalogo');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('outra vendedora não abre a vitrine da Ana no painel', async ({ page }) => {
    await entrar(page, 'carlos@dcerutti.local');
    await page.goto('/painel/vitrines');
    await expect(page.getByRole('link', { name: 'Coleção de teste' })).toHaveCount(0);
  });
});
