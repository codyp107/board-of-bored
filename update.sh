#!/usr/bin/env bash
# Pull the latest code from GitHub and rebuild. Data in ./data is untouched.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

echo "==> Pulling latest code"
git pull --ff-only
chmod +x install.sh update.sh scripts/*.sh

echo "==> Rebuilding and restarting"
docker compose up -d --build
docker image prune -f >/dev/null

echo "==> Done. Running version: $(git log -1 --format='%h %s')"
