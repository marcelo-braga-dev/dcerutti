#!/usr/bin/env bash
# PM2 do app, que roda como o usuário de sistema `dcerutti` (B-10), com o Node em /opt/node-22.
# Uso (como root): bash deploy/pm2.sh reload dcerutti | logs dcerutti | ls | save ...
set -euo pipefail
exec bash "$(dirname "$0")/app.sh" pm2 "$@"
