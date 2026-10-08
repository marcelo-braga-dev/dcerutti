#!/usr/bin/env bash
# L-01 / L-02: monta o banco de produção a partir do protótipo, com as fotos originais guardadas no cache.
#   bash deploy/preparar-producao.sh            (como root, depois de rodar o criar.sql de deploy/criar-banco-producao.sh)
# Passos (pode rodar de novo; cada passo só faz o que falta):
#   1. migrations no banco dcerutti_producao (usuário dcerutti_migra)
#   2. catálogo e custos do protótipo (db:importar-prototipo; estoque do protótipo até a contagem real, L-03)
#   3. fotos: do cache /www/wwwroot/dcerutti/fotos-originais para o armazenamento de produção (fotos:migrar)
# Depois: npm run criar-gestor (interativo) e importar o estoque real.
# Não toca no banco nem nas fotos do ambiente de teste.
set -euo pipefail
cd "$(dirname "$0")/.."
# Ajustáveis para ensaio em banco descartável: ENV_PROD=... ARMAZENAMENTO_PROD=... bash deploy/preparar-producao.sh
ENV_PROD="${ENV_PROD:-/root/dcerutti-producao/env}"
ARMAZENAMENTO_PROD="${ARMAZENAMENTO_PROD:-/www/wwwroot/dcerutti/armazenamento-producao}"
[ -r "$ENV_PROD" ] || { echo "Falta $ENV_PROD: rode antes bash deploy/criar-banco-producao.sh"; exit 1; }
MIGRA=$(sed -n 's/^MIGRATE_DATABASE_URL="\(.*\)"$/\1/p' "$ENV_PROD")
[ -n "$MIGRA" ] || { echo "MIGRATE_DATABASE_URL ausente em $ENV_PROD"; exit 1; }

# umask explícito: a pasta-mãe precisa ser atravessável pelo usuário dcerutti, qualquer que seja o umask de quem roda.
(umask 022; mkdir -p "$(dirname "$ARMAZENAMENTO_PROD")")
mkdir -p "$ARMAZENAMENTO_PROD"
chown dcerutti:dcerutti "$ARMAZENAMENTO_PROD"
chmod 750 "$ARMAZENAMENTO_PROD"

# As variáveis passadas aqui têm precedência sobre o .env do projeto (que é o do teste).
rodar() { bash deploy/app.sh env DATABASE_URL="$MIGRA" ARMAZENAMENTO_DIR="$ARMAZENAMENTO_PROD" "$@"; }

echo "== 1/3 migrations"
rodar npx prisma migrate deploy
echo "== 2/3 catálogo do protótipo"
rodar npm run db:importar-prototipo
echo "== 3/3 fotos (do cache das originais)"
rodar npm run fotos:migrar -- --remover-quebradas

echo
echo "Banco de produção pronto. Falta: criar o gestor (bash deploy/app.sh env DATABASE_URL=... npm run criar-gestor),"
echo "importar o estoque real (L-03) e virar o .env do site (docs/19-lancamento.md, Virada)."
