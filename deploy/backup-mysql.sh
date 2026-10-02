#!/usr/bin/env bash
# Backup diário do MySQL (cron: 0 3 * * * <projeto>/deploy/backup-mysql.sh)
# Credenciais em ~/.my.cnf ([mysqldump] user=... password=...). Envio ao R2 com rclone (remote "r2").
set -euo pipefail
# C-10: dumps têm dados pessoais e hashes de senha — só o root lê.
umask 077
DIR=/var/backups/dcerutti
mkdir -p "$DIR"
chmod 700 "$DIR"
ARQ="$DIR/dcerutti-$(date +%F).sql.gz"
mysqldump --single-transaction --routines dcerutti | gzip > "$ARQ"
if command -v rclone >/dev/null; then
  rclone copy "$ARQ" r2:dcerutti-backups/diario/
else
  echo "AVISO: rclone ausente — backup $ARQ ficou só neste disco." >&2
fi
# Retenção local: 7 dias.
find "$DIR" -name 'dcerutti-*.sql.gz' -mtime +7 -delete
