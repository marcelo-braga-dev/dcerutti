#!/usr/bin/env bash
# Atualiza a aplicação na VPS: bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."  # raiz do projeto, onde quer que esteja
git pull --ff-only
npm ci
npx prisma migrate deploy
NODE_OPTIONS=--max-old-space-size=1536 npm run build
pm2 reload deploy/ecosystem.config.cjs --update-env
echo "Deploy concluído: $(git rev-parse --short HEAD)"
