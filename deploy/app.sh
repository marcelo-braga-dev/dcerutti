#!/usr/bin/env bash
# Roda um comando do projeto como o usuário de sistema `dcerutti` (B-10), com o Node em /opt/node-22.
# Uso (como root, na raiz do projeto): bash deploy/app.sh npm run build | bash deploy/app.sh npx prisma migrate deploy
set -euo pipefail
cd "$(dirname "$0")/.."
exec sudo -u dcerutti -H env PATH=/opt/node-22/bin:/usr/local/bin:/usr/bin:/bin "$@"
