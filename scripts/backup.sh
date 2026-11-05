#!/usr/bin/env bash
# Nightly backup: consistent DB snapshot + attachments into one tar.gz, keeping the newest N.
# Run from cron (installed by install.sh) or by hand: /opt/board-of-bored/scripts/backup.sh
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

env_val() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
BACKUP_DIR="${BACKUP_DIR:-$(env_val BACKUP_DIR)}"
BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
KEEP="${BACKUP_KEEP:-$(env_val BACKUP_KEEP)}"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR" || { echo "$(date -Is) ERROR: cannot create $BACKUP_DIR (is the NAS mounted?)"; exit 1; }
[ -w "$BACKUP_DIR" ] || { echo "$(date -Is) ERROR: $BACKUP_DIR is not writable"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/board-of-bored-$STAMP.tar.gz"

# SQLite online backup from inside the running container (no downtime, no torn writes).
rm -rf data/.backup
docker compose exec -T app sh -c 'mkdir -p /data/.backup && node scripts/db-backup.mjs /data/.backup/board.db'
mkdir -p data/attachments

tar -czf "$OUT.partial" -C data/.backup board.db -C .. attachments
mv "$OUT.partial" "$OUT"
rm -rf data/.backup

# Keep only the newest $KEEP backups.
ls -1t "$BACKUP_DIR"/board-of-bored-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date -Is) OK: $OUT ($(du -h "$OUT" | cut -f1)); keeping newest $KEEP"
