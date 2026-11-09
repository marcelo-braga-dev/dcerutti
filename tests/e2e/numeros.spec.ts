/** Números de WhatsApp da loja (D-31): cadastrar, ligar por arrastar e por menu, tirar do número e o histórico. */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { entrar } from './ajuda';

const novoTelefone = () => { const d = String(Date.now()).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };

async function cadastrar(page: Page, apelido: string) {
  await page.getByRole('button', { name: '+ Cadastrar número' }).click();
  const janela = page.getByRole('dialog');
  await janela.locator('input[name=telefone]').fill(novoTelefone());
  await janela.locator('input[name=apelido]').fill(apelido);
  await janela.getByRole('button', { name: 'Cadastrar número' }).click();
  await expect(janela).toBeHidden();
  await expect(page.getByRole('link', { name: apelido })).toBeVisible();
}

/** Arraste com passos intermediários, como o mouse de verdade: a biblioteca só começa depois de 5 px de movimento. */
async function arrastar(page: Page, de: Locator, para: Locator) {
  await de.scrollIntoViewIfNeeded();
  const a = (await de.boundingBox())!, b = (await para.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 40), { steps: 12 });
  await page.mouse.up();
}

const cartao = (page: Page, apelido: string) => page.getByRole('region', { name: `Número ${apelido}` });

test.describe('Números de WhatsApp', () => {
  test('vendedora não abre a página', async ({ page }) => {
    await entrar(page, 'ana@dcerutti.local');
    await page.goto('/painel/numeros');
    await expect(page).toHaveURL(/\/painel$/);
  });

  test('ligar por menu, tornar conectada, mover e remover, com pendência e histórico', async ({ page }) => {
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel/numeros');
    const a = `Menu A ${Date.now().toString(36)}`, b = `Menu B ${Date.now().toString(36)}`;
    await cadastrar(page, a);
    await cadastrar(page, b);

    await page.getByRole('combobox', { name: 'Ligar Silvia Supervisora a um número' }).selectOption({ label: a });
    await expect(cartao(page, a).getByText('Silvia Supervisora')).toBeVisible();
    await cartao(page, a).getByRole('button', { name: 'Já conectei' }).click();
    await expect(cartao(page, a).getByText('Aparelho conectado')).toBeVisible();

    await cartao(page, a).getByRole('combobox', { name: 'Mover Silvia Supervisora para outro número' }).selectOption({ label: b });
    await page.getByRole('dialog').getByRole('button', { name: 'Mover' }).click();
    await expect(cartao(page, b).getByText('Silvia Supervisora')).toBeVisible();
    await expect(cartao(page, a).getByText('Solte uma pessoa aqui')).toBeVisible();
    await expect(page.getByText(`Desconectar Silvia Supervisora`).first()).toBeVisible();

    await cartao(page, b).getByRole('button', { name: 'Remover' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover do número' }).click();
    await expect(cartao(page, b).getByText('Solte uma pessoa aqui')).toBeVisible();

    await cartao(page, b).getByRole('link', { name: b }).click();
    await expect(page.getByRole('heading', { name: 'Quem teve acesso' })).toBeVisible();
    await expect(page.getByText('Silvia Supervisora').first()).toBeVisible();

    // Resolve a pendência deixada aqui: a linha some da página ao confirmar.
    await page.goto('/painel/numeros');
    const pendencia = page.getByRole('status').filter({ hasText: a });
    await pendencia.getByRole('button', { name: 'Já desconectei' }).click();
    await expect(pendencia).toHaveCount(0);
  });

  test('arrastar uma pessoa para um número e devolver para a equipe', async ({ page, isMobile }) => {
    test.skip(isMobile, 'No celular a mesma ação é feita pelo menu, coberta no outro teste.');
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel/numeros');
    const nome = `Arraste ${Date.now().toString(36)}`;
    await cadastrar(page, nome);

    await arrastar(page, page.getByRole('button', { name: 'Arrastar Silvia Supervisora', exact: true }), cartao(page, nome));
    await expect(cartao(page, nome).getByText('Silvia Supervisora')).toBeVisible();
    await expect(cartao(page, nome).getByText('Aguardando conexão')).toBeVisible();

    await arrastar(page, cartao(page, nome).getByRole('button', { name: 'Arrastar Silvia Supervisora para outro número' }), page.getByRole('region', { name: 'Equipe' }));
    const janela = page.getByRole('dialog');
    await expect(janela.getByRole('button', { name: 'Remover do número' })).toBeVisible();
    await janela.getByRole('button', { name: 'Remover do número' }).click();
    await expect(cartao(page, nome).getByText('Solte uma pessoa aqui')).toBeVisible();
  });

  test('o WhatsApp padrão aparece nas configurações, sem campo para editar', async ({ page }) => {
    await entrar(page, 'gestor@dcerutti.local');
    await page.goto('/painel/configuracoes');
    await expect(page.getByText('WhatsApp padrão da loja')).toBeVisible();
    await expect(page.locator('input[name=whatsappLoja]')).toHaveCount(0);
  });
});
