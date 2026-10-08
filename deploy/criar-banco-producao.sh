#!/usr/bin/env bash
# L-02 / L-06: gera o SQL do banco de produção com dois usuários e senhas novas, sem que as senhas passem por conversa.
#   bash deploy/criar-banco-producao.sh
# Cria (só o root lê):
#   /root/dcerutti-producao/criar.sql   → rodar como root do MariaDB (aaPanel → Banco de dados → root, ou mysql -uroot -p)
#   /root/dcerutti-producao/env         → linhas DATABASE_URL, MIGRATE_DATABASE_URL e BETTER_AUTH_SECRET para o .env de produção
# Usuários:
#   dcerutti_app   → só SELECT/INSERT/UPDATE/DELETE (o site)
#   dcerutti_migra → tudo no banco dcerutti_producao (migrations e scripts de importação)
# Não sobrescreve: se a pasta já existir, mostra o que já foi gerado.
set -euo pipefail
umask 077
DIR=/root/dcerutti-producao
BANCO=dcerutti_producao
if [ -e "$DIR/criar.sql" ]; then
  echo "Já gerado em $DIR (apague a pasta para gerar senhas novas)."
  exit 0
fi
mkdir -p "$DIR"
senha() { openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 32; }
APP=$(senha); MIGRA=$(senha); SEGREDO=$(openssl rand -base64 32)

cat > "$DIR/criar.sql" <<SQL
CREATE DATABASE IF NOT EXISTS \`$BANCO\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dcerutti_app'@'localhost' IDENTIFIED BY '$APP';
CREATE USER IF NOT EXISTS 'dcerutti_migra'@'localhost' IDENTIFIED BY '$MIGRA';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$BANCO\`.* TO 'dcerutti_app'@'localhost';
GRANT ALL PRIVILEGES ON \`$BANCO\`.* TO 'dcerutti_migra'@'localhost';
FLUSH PRIVILEGES;
SQL

cat > "$DIR/env" <<ENV
DATABASE_URL="mysql://dcerutti_app:$APP@localhost:3306/$BANCO"
MIGRATE_DATABASE_URL="mysql://dcerutti_migra:$MIGRA@localhost:3306/$BANCO"
BETTER_AUTH_SECRET="$SEGREDO"
ENV

echo "Gerado em $DIR:"
echo "  1. Rode $DIR/criar.sql como root do MariaDB."
echo "  2. Use as linhas de $DIR/env no .env de produção (deploy/preparar-producao.sh lê esse arquivo)."
