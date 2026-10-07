// PM2 na VPS (D-10): bash deploy/pm2.sh start deploy/ecosystem.config.cjs && bash deploy/pm2.sh save
// Um processo só (modo fork): o cache do catálogo fica em memória (src/server/catalogo.ts).
module.exports = {
  apps: [
    {
      name: 'dcerutti',
      cwd: `${__dirname}/..`, // raiz do projeto
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      // B-10: o PM2 deste app roda como o usuário de sistema dcerutti (deploy/pm2.sh), com o Node fora do /root.
      interpreter: '/opt/node-22/bin/node',
      exec_mode: 'fork',
      instances: 1,
      // Rede de segurança; o normal fica abaixo de 500 MB (B-02).
      max_memory_restart: '1200M',
      // MALLOC_ARENA_MAX=2: recomendação do sharp no Linux (glibc) para conter a fragmentação de memória.
      env: { NODE_ENV: 'production', MALLOC_ARENA_MAX: '2', HOME: '/home/dcerutti' },
    },
  ],
};
