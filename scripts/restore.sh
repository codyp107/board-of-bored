#!/usr/bin/env bash
# Restore a backup made by backup.sh. The current data folder is kept as data.pre-restore-<time>.
# Usage: /opt/board-of-bored/scripts/restore.sh /mnt/nas/board-of-bored/board-of-bored-20261105-023000.tar.gz
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "usage: $0 <backup.tar.gz>"; exit 1; }
tar -tzf "$ARCHIVE" | grep -qx 'board.db' || { echo "That archive has no board.db; not a Board of Bored backup."; exit 1; }

read -r -p "Restore $ARCHIVE over the current data? [y/N] " ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Cancelled."; exit 0; }

echo "==> Stopping app"
docker compose stop app

SAVED="data.pre-restore-$(date +%Y%m%d-%H%M%S)"
echo "==> Moving current data to $SAVED"
mv data "$SAVED"

echo "==> Extracting backup"
mkdir -p data
tar -xzf "$ARCHIVE" -C data
mkdir -p data/attachments
chown -R 1000:1000 data

echo "==> Starting app"
docker compose up -d app
echo "Restored. If everything looks right you can delete $SAVED later."
