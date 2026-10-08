#!/usr/bin/env bash
# Backup diário do banco e das fotos (cron: 0 3 * * * <projeto>/deploy/backup-mysql.sh)
# Credenciais do banco em ~/.my.cnf ([mysqldump] user=... password=...).
#
# Variáveis (opcionais):
#   BANCO=dcerutti                      banco a copiar
#   ARMAZENAMENTO=<projeto>/armazenamento  pasta das fotos enviadas (L-09: antes ficava sem backup)
#   BACKUP_REMOTO=remoto:pasta           destino fora do servidor via rclone (ex.: gdrive:dcerutti-backups).
#                                        Sem ele, o backup fica só neste disco e o log avisa.
set -euo pipefail
# C-10: dumps têm dados pessoais e hashes de senha — só o root lê.
umask 077
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BANCO="${BANCO:-dcerutti}"
ARMAZENAMENTO="${ARMAZENAMENTO:-$RAIZ/armazenamento}"
DIR=/var/backups/dcerutti
DIA="$(date +%F)"
mkdir -p "$DIR"
chmod 700 "$DIR"

ARQ_BANCO="$DIR/$BANCO-$DIA.sql.gz"
mysqldump --single-transaction --routines "$BANCO" | gzip > "$ARQ_BANCO"

ARQ_FOTOS=""
if [ -d "$ARMAZENAMENTO" ]; then
  ARQ_FOTOS="$DIR/$BANCO-fotos-$DIA.tar"
  # WebP já é comprimido: tar sem gzip.
  tar -cf "$ARQ_FOTOS" -C "$(dirname "$ARMAZENAMENTO")" "$(basename "$ARMAZENAMENTO")"
fi

if [ -n "${BACKUP_REMOTO:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$ARQ_BANCO" "$BACKUP_REMOTO/diario/"
  [ -n "$ARQ_FOTOS" ] && rclone copy "$ARQ_FOTOS" "$BACKUP_REMOTO/diario/"
  echo "$(date '+%F %T') backup $BANCO enviado para $BACKUP_REMOTO"
else
  echo "$(date '+%F %T') AVISO: sem BACKUP_REMOTO (ou rclone) — backup de $BANCO ficou só neste disco ($DIR)." >&2
fi

# Retenção local: 7 dias. Só na pasta principal: $DIR/preservado/ nunca é apagada.
find "$DIR" -maxdepth 1 -name "$BANCO-*" -mtime +7 -delete
