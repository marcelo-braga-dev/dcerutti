/** Editor visual da página inicial: trocar o destino de botões e cards, recusar endereço inválido e voltar ao padrão. */
import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

test.describe('Editor da página inicial: links', () => {
  test.beforeEach(({ page }) => entrar(page, 'gestor@dcerutti.local'));

  test('muda botão e cards, vale na loja e volta ao padrão', async ({ page }) => {
    await page.goto('/editar/inicio');
    const pagina = page.locator('main');
    const janela = page.getByRole('dialog');
    const abrir = (seletor: string, texto: string) => pagina.locator(seletor, { hasText: texto }).getByRole('button', { name: '🔗 Link' });

    // Parte do padrão, mesmo que uma execução anterior tenha parado no meio.
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Voltar ao padrão' }).click();
    const salvar = page.getByRole('button', { name: 'Salvar' });
    if (await salvar.isEnabled()) {
      await salvar.click();
      await expect(page.getByText('Página salva')).toBeVisible();
    }

    // Endereço perigoso não passa; endereço válido é aceito.
    await abrir('a', 'Ver novidades').click();
    await expect(janela.getByRole('textbox')).toHaveValue('/catalogo?ordem=novidades');
    await janela.getByRole('textbox').fill('javascript:alert(1)');
    await janela.getByRole('button', { name: 'Aplicar' }).click();
    await expect(janela.getByRole('alert')).toContainText('Endereço inválido');
    await janela.getByRole('textbox').fill('/sacola');
    await janela.getByRole('button', { name: 'Aplicar' }).click();
    await expect(janela).toBeHidden();

    // Card com ícone que não tinha link: endereço de fora, sem o https://.
    await abrir('li', 'Prove em casa').click();
    await janela.getByRole('textbox').fill('wa.me/5549988036499');
    await janela.getByRole('button', { name: 'Aplicar' }).click();
    await expect(janela).toBeHidden();

    // Card do banner, pela lista de páginas; endereço da própria loja vira caminho.
    await abrir('a', 'Feminino').click();
    await janela.getByRole('combobox').selectOption({ label: 'Masculino' });
    await expect(janela.getByRole('textbox')).toHaveValue('/catalogo?genero=masculino');
    await janela.getByRole('textbox').fill(new URL('/catalogo?promo=1', page.url()).href);
    await janela.getByRole('button', { name: 'Aplicar' }).click();
    await expect(janela).toBeHidden();

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Página salva')).toBeVisible();

    // Na loja.
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Ver novidades' })).toHaveAttribute('href', '/sacola');
    const card = page.getByRole('link', { name: /Prove em casa/ }).first();
    await expect(card).toHaveAttribute('href', 'https://wa.me/5549988036499');
    await expect(card).toHaveAttribute('target', '_blank');
    await expect(page.locator('main').getByRole('link', { name: 'Feminino' })).toHaveAttribute('href', '/catalogo?promo=1');

    // Voltar ao padrão: a vantagem da loja deixa de ser link.
    await page.goto('/editar/inicio');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Voltar ao padrão' }).click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Página salva')).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Ver novidades' })).toHaveAttribute('href', '/catalogo?ordem=novidades');
    await expect(page.getByRole('link', { name: /Prove em casa/ })).toHaveCount(0);
  });
});
