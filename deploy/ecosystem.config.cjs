// PM2 na VPS (D-10): pm2 start deploy/ecosystem.config.cjs && pm2 save
// Um processo só (modo fork): o cache do catálogo fica em memória (src/server/catalogo.ts).
module.exports = {
  apps: [
    {
      name: 'dcerutti',
      cwd: '/srv/dcerutti',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
