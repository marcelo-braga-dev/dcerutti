import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

/**
 * Antes da suíte: recria o banco de integração e roda o seed completo (scripts/preparar-banco-teste.ts),
 * num processo à parte (o seed roda com a condição react-server, como o Next).
 */
export default function preparar() {
  const url = process.env.INTEGRACAO_DATABASE_URL ?? '';
  if (!/\/test_[\w]+$/.test(url)) throw new Error('Defina INTEGRACAO_DATABASE_URL com um banco test_* (ex.: .../test_dcerutti_integracao).');
  if (!process.env.SEED_SENHA) throw new Error('Defina SEED_SENHA (mínimo 8 caracteres).');
  if (process.env.INTEGRACAO_SEM_PREPARO === '1') return;
  execFileSync('npx', ['tsx', '--conditions=react-server', 'scripts/preparar-banco-teste.ts'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, DATABASE_URL: url, ARMAZENAMENTO_DIR: path.join(os.tmpdir(), 'dcerutti-integracao-arquivos') },
  });
}
