/** Link da peça (docs/26): a vendedora envia, a cliente abre sem login, pede, e o pedido cai na fila de quem enviou. */
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { entrar } from './ajuda';

const celular = () => { const d = String(Date.now()).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };

test.describe('Link da peça', () => {
  test('enviar, abrir sem login, pedir e aparecer na fila', async ({ browser }) => {
    const ana = await (await browser.newContext()).newPage();
    await entrar(ana, 'ana@dcerutti.local');
    await ana.goto('/painel/busca?q=FIX-ESTOQUE');
    await ana.getByRole('button', { name: /^Enviar / }).first().click();
    const texto = ana.getByRole('textbox', { name: 'Texto da peça' });
    await expect(texto).toHaveValue(/\/peca\//);
    const caminho = new URL((await texto.inputValue()).match(/https?:\/\/\S+/)![0]).pathname;

    const visitante = await (await browser.newContext()).newPage();
    const r = await visitante.goto(caminho);
    expect(r?.status()).toBe(200);
    await expect(visitante).toHaveURL(new RegExp(caminho.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(visitante.getByRole('heading', { level: 1 })).toBeVisible();
    const html = await visitante.content();
    expect(html).toContain('noindex');
    expect(html).not.toMatch(/custoUnitario|em estoque/);
    const cartao = await visitante.request.get(`${caminho}/cartao.jpg`);
    expect(cartao.status()).toBe(200);
    expect(cartao.headers()['content-type']).toContain('image/jpeg');

    // O resto do catálogo continua privado.
    await visitante.goto('/catalogo');
    await expect(visitante).toHaveURL(/\/entrar/);
    const adulterado = await visitante.goto(caminho.slice(0, -3) + 'AAA');
    expect(adulterado?.status()).toBe(404);

    await visitante.goto(caminho);
    const nome = `Visitante ${Date.now().toString(36)}`;
    await visitante.getByRole('radio').first().click();
    await visitante.getByLabel('Seu nome').fill(nome);
    await visitante.getByLabel('Seu WhatsApp').fill(celular());
    await visitante.getByRole('button', { name: 'Quero esta peça' }).click();
    await expect(visitante.getByText('Para continuar, aceite o contato da loja.')).toBeVisible();
    await visitante.getByRole('checkbox', { name: /^Aceito/ }).check();
    await visitante.getByRole('button', { name: 'Quero esta peça' }).click();
    await expect(visitante.getByRole('heading', { name: 'Pedido recebido!' })).toBeVisible();
    expect(await visitante.getByRole('link', { name: 'Abrir o WhatsApp' }).getAttribute('href')).toContain('phone=5549988904646');

    await ana.goto('/painel/atendimento');
    await ana.getByRole('link', { name: nome }).click();
    await expect(ana.getByText('Link da peça')).toBeVisible();
    await expect(ana.getByText(/Número informado pela própria pessoa/)).toBeVisible();
    await expect(ana.getByText('Total das peças')).toBeVisible();
    await expect(ana.getByRole('button', { name: 'Criar pedido' })).toHaveCount(0);
  });

  test('a vendedora acrescenta uma foto, sem ver preço nem estoque', async ({ page }) => {
    await entrar(page, 'ana@dcerutti.local');
    await page.goto('/painel/busca?q=FIX-ESTOQUE');
    await page.getByRole('button', { name: /^Enviar / }).first().click();
    await page.getByRole('link', { name: 'Adicionar foto ou vídeo' }).click();
    await expect(page).toHaveURL(/\/midia$/);
    await expect(page.getByText('Mais Compatível')).toBeVisible();
    await expect(page.locator('input[name=preco], input[name=custo]')).toHaveCount(0);
    const antes = await page.getByRole('button', { name: /^Remover foto/ }).count();
    expect(antes).toBe(0);
    await page.locator('input[type=file][accept^="image"]').setInputFiles({ name: 'nova.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 40, height: 40, channels: 3, background: '#886644' } }).png().toBuffer() });
    await expect(page.getByText('Fotos enviadas. Toque em Salvar')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Remover foto/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Fotos e vídeos salvos.')).toBeVisible();
  });
});
