/** Atendimento online (docs/26): do contato do Direct, só com o @, até o pedido, e o encaminhamento pela carteira. */
import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';

const celular = () => { const d = String(Date.now()).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };
const carimbo = () => Date.now().toString(36);

test.describe('Atendimento', () => {
  test('Direct só com @: fila, WhatsApp, peça, pedido', async ({ page }) => {
    await entrar(page, 'ana@dcerutti.local');
    const nome = `Direct ${carimbo()}`;
    await page.goto('/painel/atendimento/novo');
    await page.fill('input[name=nome]', nome);
    await page.fill('input[name=instagram]', `@e2e.${carimbo()}`);
    await page.selectOption('select[name=canal]', 'instagram');
    await page.fill('textarea[name=nota]', 'Procura vestido');
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page).toHaveURL(/\/painel\/atendimento\/[a-z0-9]+$/);
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    await expect(page.getByText('Procura vestido')).toBeVisible();
    await expect(page.getByText('Peça o WhatsApp')).toBeVisible();

    await page.goto('/painel/atendimento');
    await expect(page.getByRole('link', { name: nome })).toBeVisible();
    await page.getByRole('link', { name: nome }).click();

    await page.locator('input[name=telefone]').fill(celular());
    await page.getByRole('button', { name: 'Salvar contato' }).click();
    await expect(page.getByRole('link', { name: 'Ver a ficha' })).toBeVisible();

    await page.getByLabel('Resposta pronta').selectOption({ label: 'Saudação' });
    await expect(page.getByLabel('Mensagem')).toHaveValue(new RegExp(`Oi, Direct! Aqui é Ana`));
    const whatsapp = page.getByRole('link', { name: 'WhatsApp', exact: true });
    expect(await whatsapp.getAttribute('href')).toContain('api.whatsapp.com/send');

    await page.getByLabel('Buscar peça').fill('FIX-ESTOQUE');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('button', { name: /^Adicionar .* tamanho / }).first().click();
    await expect(page.getByText('Total das peças')).toBeVisible();
    await page.getByRole('button', { name: 'Criar pedido' }).click();
    await expect(page.getByText(/Pedido PED-\d+ criado/)).toBeVisible();
    await page.getByRole('link', { name: 'Ver o pedido' }).click();
    await expect(page).toHaveURL(/\/painel\/pedidos\//);
  });

  test('contato de outra carteira vai para a dona e a gestão vê tudo', async ({ browser }) => {
    const nome = `Cliente Carlos ${carimbo()}`, tel = celular();
    const carlos = await (await browser.newContext()).newPage();
    await entrar(carlos, 'carlos@dcerutti.local');
    await carlos.goto('/painel/atendimento/novo');
    await carlos.fill('input[name=nome]', nome);
    await carlos.fill('input[name=telefone]', tel);
    await carlos.getByRole('button', { name: 'Registrar' }).click();
    await expect(carlos).toHaveURL(/\/painel\/atendimento\/[a-z0-9]+$/);
    const endereco = carlos.url();
    await carlos.locator('select[name=etapa]').selectOption('perdido');
    await carlos.locator('select[name=motivoPerda]').selectOption('preco');
    await carlos.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(carlos.getByText('Atendimento atualizado.')).toBeVisible();

    const ana = await (await browser.newContext()).newPage();
    await entrar(ana, 'ana@dcerutti.local');
    await ana.goto(endereco);
    await expect(ana.getByRole('heading', { name: nome })).toHaveCount(0);
    await ana.goto('/painel/atendimento/novo');
    await ana.fill('input[name=nome]', 'Nome digitado');
    await ana.fill('input[name=telefone]', tel);
    await ana.getByRole('button', { name: 'Registrar' }).click();
    await expect(ana.getByText(/Este contato é de Carlos/)).toBeVisible();
    await expect(ana.getByText(nome)).toHaveCount(0);

    const gestor = await (await browser.newContext()).newPage();
    await entrar(gestor, 'gestor@dcerutti.local');
    await gestor.goto('/painel/atendimento/equipe');
    await expect(gestor.getByRole('heading', { name: 'Visão da equipe' })).toBeVisible();
    await gestor.goto(`/painel/atendimento/lista?q=${encodeURIComponent(nome)}`);
    // Dois: o primeiro foi perdido, e o registrado pela Ana abriu outro, também para o Carlos.
    await expect(gestor.getByRole('link', { name: nome })).toHaveCount(2);
  });

  test('desligado nas Configurações, o menu e as páginas somem', async ({ page }) => {
    await entrar(page, 'gestor@dcerutti.local');
    const interruptor = async (ligado: boolean) => {
      await page.goto('/painel/configuracoes');
      await page.locator('input[name=atendimentoLigado]').setChecked(ligado);
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
    };
    await interruptor(false);
    try {
      const r = await page.goto('/painel/atendimento');
      expect(await page.getByRole('heading', { name: 'Hoje', exact: true }).count()).toBe(0);
      expect(r).not.toBeNull();
    } finally {
      await interruptor(true);
    }
    await page.goto('/painel/atendimento');
    await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  });
});
