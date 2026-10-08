import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import OrdemDosArquivos from './tests/integracao/suporte/ordem';

/**
 * Testes de integração: os módulos do servidor e as Server Actions contra um MariaDB real e isolado.
 *   INTEGRACAO_DATABASE_URL=mysql://.../test_dcerutti_integracao SEED_SENHA=... npm run test:integracao
 * O banco é recriado e semeado (seed completo) antes da suíte; INTEGRACAO_SEM_PREPARO=1 reaproveita o banco atual.
 * As APIs do Next (sessão, redirect, cache, cookies) são simuladas em tests/integracao/suporte/next.ts.
 */
const url = process.env.INTEGRACAO_DATABASE_URL ?? '';
const armazenamento = path.join(os.tmpdir(), 'dcerutti-integracao-arquivos');

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/integracao/suporte/vazio.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integracao/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integracao/suporte/preparar.ts'],
    setupFiles: ['tests/integracao/suporte/next.ts'],
    // Um arquivo por vez: todos usam o mesmo banco.
    fileParallelism: false,
    sequence: { sequencer: OrdemDosArquivos },
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: url,
      ARMAZENAMENTO_DIR: armazenamento,
      NEXT_PUBLIC_SITE_URL: 'https://teste.dcerutti.local',
      BETTER_AUTH_URL: 'https://teste.dcerutti.local',
      BETTER_AUTH_SECRET: 'segredo-so-para-os-testes-de-integracao-0123456789',
      SMTP_URL: '',
    },
  },
});
