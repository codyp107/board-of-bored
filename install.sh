#!/usr/bin/env bash
# Board of Bored installer for a Debian/Ubuntu Proxmox CT (or VM).
# Run as root from the CT console:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/codyp107/board-of-bored/main/install.sh)"
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/codyp107/board-of-bored.git}"
DIR="${DIR:-/opt/board-of-bored}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root."

say "Installing base packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git cron >/dev/null

if ! command -v docker >/dev/null 2>&1; then
	say "Installing Docker"
	curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker info >/dev/null 2>&1 || ! docker run --rm hello-world >/dev/null 2>&1; then
	die "Docker isn't working in this container.
On the Proxmox HOST shell run (replace 105 with this CT's ID):
    pct set 105 -features nesting=1,keyctl=1
    pct reboot 105
then run this installer again."
fi

if [ -d "$DIR/.git" ]; then
	say "Updating existing install in $DIR"
	git -C "$DIR" pull --ff-only
else
	say "Downloading Board of Bored to $DIR"
	git clone "$REPO_URL" "$DIR"
fi
cd "$DIR"
chmod +x install.sh update.sh scripts/*.sh

if [ ! -f .env ]; then
	cp .env.example .env
	chmod 600 .env
	say "Created $DIR/.env from the example (edit it any time, then run ./update.sh)"
fi

# The container runs as uid 1000 (node); give it the data folder.
mkdir -p data/attachments
chown -R 1000:1000 data

say "Building and starting (first build takes a few minutes)"
docker compose up -d --build

say "Scheduling nightly backup at 2:30 AM"
cat >/etc/cron.d/board-of-bored <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root $DIR/scripts/backup.sh >> /var/log/board-of-bored-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/board-of-bored

PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2 || true)
PORT=${PORT:-80}
IP=$(hostname -I | awk '{print $1}')
URL="http://$IP"; [ "$PORT" != "80" ] && URL="$URL:$PORT"

say "Waiting for the app to come up"
for _ in $(seq 1 60); do
	curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
	sleep 2
done

cat <<EOF

  Board of Bored is running.

  Open:     $URL
  First visit shows the one-time setup page to create your account.

  Update:   $DIR/update.sh
  Backup:   $DIR/scripts/backup.sh   (nightly at 2:30; set BACKUP_DIR in .env to your NAS)
  Logs:     cd $DIR && docker compose logs -f

EOF
