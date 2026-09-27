#!/usr/bin/env bash
# Backup diário do MySQL (cron: 0 3 * * * /srv/dcerutti/deploy/backup-mysql.sh)
# Credenciais em ~/.my.cnf ([mysqldump] user=... password=...). Envio ao R2 com rclone (remote "r2").
set -euo pipefail
DIR=/var/backups/dcerutti
mkdir -p "$DIR"
ARQ="$DIR/dcerutti-$(date +%F).sql.gz"
mysqldump --single-transaction --routines dcerutti | gzip > "$ARQ"
if command -v rclone >/dev/null; then rclone copy "$ARQ" r2:dcerutti-backups/diario/; fi
# Retenção local: 7 dias.
find "$DIR" -name 'dcerutti-*.sql.gz' -mtime +7 -delete
