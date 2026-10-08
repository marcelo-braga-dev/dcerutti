#!/usr/bin/env bash
# Atualiza a aplicação na VPS: bash deploy/deploy.sh (como root ou como dcerutti).
# Tudo roda como o usuário de sistema `dcerutti` (B-10), dono dos arquivos e do processo.
set -euo pipefail
cd "$(dirname "$0")/.."  # raiz do projeto, onde quer que esteja
if [ "$(id -un)" != dcerutti ]; then exec bash deploy/app.sh bash deploy/deploy.sh "$@"; fi
git pull --ff-only
npm ci
# L-06: em produção o site usa um usuário só com DML; as migrations usam MIGRATE_DATABASE_URL (do .env), se houver.
MIGRA=$(sed -n 's/^MIGRATE_DATABASE_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .env 2>/dev/null || true)
if [ -n "$MIGRA" ]; then DATABASE_URL="$MIGRA" npx prisma migrate deploy; else npx prisma migrate deploy; fi
NODE_OPTIONS=--max-old-space-size=1536 npm run build
pm2 reload deploy/ecosystem.config.cjs --update-env
echo "Deploy concluído: $(git rev-parse --short HEAD)"
