@AGENTS.md

# Ambiente

Este servidor (`/www/wwwroot/dcerutti/site`, servido em dcerutti.com.br pelo PM2) é de **desenvolvimento e teste**, não de produção. Todos os dados no banco são de teste. Pode rodar build e reload aqui para validar mudanças.

O app roda como o usuário de sistema `dcerutti` (dono dos arquivos), com o Node em `/opt/node-22` e um PM2 próprio. Como root, rode os comandos do projeto por estes atalhos, senão arquivos ficam com dono root e o app não consegue gravá-los:

- `bash deploy/app.sh <comando>`: ex. `bash deploy/app.sh env NODE_OPTIONS=--max-old-space-size=1536 npm run build`, `bash deploy/app.sh npx prisma migrate deploy`
- `bash deploy/pm2.sh <comando>`: ex. `bash deploy/pm2.sh reload dcerutti`, `bash deploy/pm2.sh logs dcerutti`
- `bash deploy/deploy.sh`: pull, `npm ci`, migrations, build e reload, tudo como `dcerutti`
