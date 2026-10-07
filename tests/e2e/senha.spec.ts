import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SENHA } from './ajuda';

/**
 * B-03: "Esqueci a senha" de ponta a ponta. Sem SMTP, o servidor escreve o e-mail no log; o teste lê o link de lá.
 * Precisa de E2E_LOG_SERVIDOR com o caminho do log da instância testada (senão é pulado).
 */
const LOG = process.env.E2E_LOG_SERVIDOR;

test('esqueci a senha: link por e-mail, uso único, entra com a senha nova', async ({ page }) => {
  test.skip(!LOG, 'defina E2E_LOG_SERVIDOR com o log do servidor de teste');
  const email = 'carlos@dcerutti.local';
  const antes = readFileSync(LOG!, 'utf8').length;

  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Esqueci a senha' }).click();
  await page.fill('input[name=email]', email);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText('Se este e-mail tiver conta')).toBeVisible();

  let link = '';
  await expect.poll(() => {
    link = readFileSync(LOG!, 'utf8').slice(antes).match(/https?:\/\/\S+\/redefinir-senha\?token=\S+/)?.[0] ?? '';
    return link;
  }).not.toBe('');
  const caminho = new URL(link).pathname + new URL(link).search;

  // A senha nova é a mesma do seed, para não quebrar os outros testes.
  await page.goto(caminho);
  await page.fill('input[name=senha]', SENHA);
  await page.fill('input[name=confirmacao]', SENHA);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByText('Senha nova salva')).toBeVisible();

  await page.goto(caminho);
  await page.fill('input[name=senha]', SENHA);
  await page.fill('input[name=confirmacao]', SENHA);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByText('inválido ou já expirou')).toBeVisible();

  await page.goto('/entrar');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=senha]', SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/painel/);
});

test('e-mail sem conta recebe a mesma resposta', async ({ page }) => {
  await page.goto('/esqueci-senha');
  await page.fill('input[name=email]', `ninguem.${Date.now()}@exemplo.com`);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText('Se este e-mail tiver conta')).toBeVisible();
});
