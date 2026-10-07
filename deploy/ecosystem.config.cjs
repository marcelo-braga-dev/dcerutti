// PM2 na VPS (D-10): pm2 start deploy/ecosystem.config.cjs && pm2 save
// Um processo só (modo fork): o cache do catálogo fica em memória (src/server/catalogo.ts).
module.exports = {
  apps: [
    {
      name: 'dcerutti',
      cwd: `${__dirname}/..`, // raiz do projeto
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      exec_mode: 'fork',
      instances: 1,
      // Rede de segurança; o normal fica abaixo de 500 MB (B-02).
      max_memory_restart: '1200M',
      // MALLOC_ARENA_MAX=2: recomendação do sharp no Linux (glibc) para conter a fragmentação de memória.
      env: { NODE_ENV: 'production', MALLOC_ARENA_MAX: '2' },
    },
  ],
};
