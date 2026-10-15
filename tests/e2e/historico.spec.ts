import { expect, test } from '@playwright/test';
import { adicionarPeca, entrar } from './ajuda';

test.describe.configure({ mode: 'serial' });

/**
 * Histórico do cliente (docs/21): a cliente navega na loja e o vendedor dela vê na ficha, na linha do tempo, no painel
 * e na tela Interesse. Outro vendedor não vê.
 */
test('o que a cliente vê e separa aparece para o vendedor dela', async ({ browser }) => {
  const termo = `zzsemresultado${Date.now() % 100000}`;
  const cliente = await (await browser.newContext()).newPage();
  const enviados = [] as string[];
  cliente.on('request', r => { if (r.url().endsWith('/api/atividade')) enviados.push(r.postData() ?? ''); });
  await entrar(cliente, 'cliente@dcerutti.local'); // Mariana Souza, cliente da Ana
  await cliente.goto(`/catalogo?q=${termo}`);
  await expect(cliente.getByText('0 peças', { exact: true })).toBeVisible();
  const { referencia, tamanho } = await adicionarPeca(cliente, 'camisetas');
  await cliente.goto('/sacola');
  await cliente.goto('/'); // sai das páginas: o tempo e a sacola são enviados
  await expect.poll(() => enviados.join('\n')).toContain('carrinho');
  await expect.poll(() => enviados.join('\n')).toContain(`/produto/${referencia}`);
  await cliente.context().close();

  const ana = await (await browser.newContext()).newPage();
  await entrar(ana, 'ana@dcerutti.local');
  await ana.goto('/painel');
  await expect(ana.getByRole('heading', { name: 'Clientes interessados agora' })).toBeVisible();
  await expect(ana.getByText('Mariana Souza').first()).toBeVisible();

  await ana.goto('/painel/clientes?sacola=1&ordem=acesso');
  await ana.getByRole('link', { name: 'Mariana Souza' }).first().click();
  await expect(ana.getByRole('heading', { name: 'Interesse e acesso' })).toBeVisible();
  await expect(ana.getByText(/Na sacola agora/)).toBeVisible();
  await expect(ana.getByText(`“${termo}” · nada encontrado`)).toBeVisible();

  await ana.getByRole('link', { name: 'Histórico completo' }).click();
  await expect(ana.getByText(new RegExp(`Buscou “${termo}”`))).toBeVisible();
  await expect(ana.getByText(new RegExp(`Escolheu o tam\\. ${tamanho} de`)).first()).toBeVisible();
  await expect(ana.getByText(/Pôs na sacola 1×/).first()).toBeVisible();
  const ficha = ana.url().replace(/\/historico.*$/, '');

  await ana.goto('/painel/interesse?dias=7');
  await expect(ana.getByRole('heading', { name: 'Peças mais vistas' })).toBeVisible();
  await expect(ana.getByText(`“${termo}”`).first()).toBeVisible();
  await ana.context().close();

  // Outro vendedor não abre a ficha nem o histórico da cliente da Ana.
  const carlos = await (await browser.newContext()).newPage();
  await entrar(carlos, 'carlos@dcerutti.local');
  await carlos.goto(`${new URL(ficha).pathname}/historico`);
  await expect(carlos.getByText(new RegExp(`Buscou “${termo}”`))).toHaveCount(0);
  await carlos.context().close();
});
