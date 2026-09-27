import { defineConfig, devices } from '@playwright/test';

/**
 * Testes ponta a ponta. Precisam do banco com seed + importação (npm run db:seed / db:importar-prototipo).
 * Por padrão sobem o build de produção; para usar um servidor já rodando: E2E_URL=http://localhost:3000.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: process.env.E2E_URL ?? 'http://localhost:3000', trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /celular/ },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /celular/ },
  ],
  webServer: process.env.E2E_URL ? undefined : { command: 'npm run start', url: 'http://localhost:3000/entrar', reuseExistingServer: true, timeout: 120_000 },
});
