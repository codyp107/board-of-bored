#!/usr/bin/env bash
# Create a Debian 12 CT on this Proxmox node and install Board of Bored inside it.
# Run on the Proxmox HOST shell (node > Shell) as root:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/codyp107/board-of-bored/main/proxmox-create-ct.sh)"
#
# Optional overrides (prefix the command with them, e.g. CTID=150 IP=192.168.1.50/24 GW=192.168.1.1 bash -c ...):
#   CTID       container ID            (default: next free ID)
#   CT_HOSTNAME container hostname     (default: board-of-bored)
#   STORAGE    disk storage            (default: local-lvm if present, else first storage that holds CT disks)
#   BRIDGE     network bridge          (default: vmbr0)
#   IP / GW    static IP in CIDR + gateway (default: DHCP; set a reservation in pfSense)
#   CORES / MEMORY / DISK              (default: 2 / 1024 MB / 8 GB)
set -euo pipefail

INSTALL_URL="https://raw.githubusercontent.com/codyp107/board-of-bored/main/install.sh"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

command -v pct >/dev/null 2>&1 || die "Run this on the Proxmox host, not inside a container."
[ "$(id -u)" -eq 0 ] || die "Run as root."

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${CT_HOSTNAME:-board-of-bored}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-2}"
MEMORY="${MEMORY:-1024}"
DISK="${DISK:-8}"

if [ -z "${STORAGE:-}" ]; then
	if pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx local-lvm; then
		STORAGE=local-lvm
	else
		STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')
	fi
fi
[ -n "$STORAGE" ] || die "Couldn't find a storage for container disks. Re-run with STORAGE=<name>."

TPL_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')
[ -n "$TPL_STORAGE" ] || die "No storage allows container templates (enable 'Container template' on 'local')."

if [ -n "${IP:-}" ]; then
	NET="name=eth0,bridge=$BRIDGE,ip=$IP${GW:+,gw=$GW}"
else
	NET="name=eth0,bridge=$BRIDGE,ip=dhcp"
fi

pct status "$CTID" >/dev/null 2>&1 && die "CT $CTID already exists. Re-run with CTID=<free id>."

cat <<EOF

  About to create:
    CT ID     $CTID
    Hostname  $HOSTNAME
    Disk      ${DISK} GB on $STORAGE
    CPU/RAM   $CORES cores / ${MEMORY} MB
    Network   $BRIDGE, ${IP:-DHCP}
    Features  unprivileged, nesting + keyctl (for Docker), start on boot

EOF

while true; do
	read -r -s -p "Set a root password for the CT console: " PW1; echo
	read -r -s -p "Confirm password: " PW2; echo
	[ "$PW1" = "$PW2" ] && [ ${#PW1} -ge 8 ] && break
	echo "Passwords must match and be at least 8 characters."
done

say "Finding the Debian 12 template"
pveam update >/dev/null
TPL=$(pveam available --section system | awk '{print $2}' | grep -E '^debian-12-standard_.*amd64\.tar\.(zst|gz|xz)$' | sort -V | tail -n1)
[ -n "$TPL" ] || die "Debian 12 template not found in 'pveam available'."
if ! pveam list "$TPL_STORAGE" | grep -q "$TPL"; then
	say "Downloading $TPL to $TPL_STORAGE"
	pveam download "$TPL_STORAGE" "$TPL"
fi

say "Creating CT $CTID"
pct create "$CTID" "$TPL_STORAGE:vztmpl/$TPL" \
	--hostname "$HOSTNAME" \
	--cores "$CORES" \
	--memory "$MEMORY" \
	--swap 512 \
	--rootfs "$STORAGE:$DISK" \
	--net0 "$NET" \
	--unprivileged 1 \
	--features nesting=1,keyctl=1 \
	--onboot 1 \
	--timezone America/Denver \
	--description "Board of Bored task dashboard. https://github.com/codyp107/board-of-bored" \
	--password "$PW1"
unset PW1 PW2

say "Starting CT $CTID"
pct start "$CTID"

say "Waiting for network"
for _ in $(seq 1 60); do
	pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1 && break
	sleep 2
done
pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1 || die "CT $CTID has no internet/DNS. Check the bridge and DHCP, then run inside it: bash -c \"\$(curl -fsSL $INSTALL_URL)\""

say "Installing Board of Bored inside CT $CTID (Docker + first build, a few minutes)"
pct exec "$CTID" -- bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null && bash -c \"\$(curl -fsSL $INSTALL_URL)\""

CT_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
cat <<EOF

  Done. CT $CTID ($HOSTNAME) is running Board of Bored.

  Open:  http://$CT_IP   (first visit = one-time setup page)

  Next:
    - pfSense: add a DHCP static mapping for this CT so the IP never changes.
    - AdGuard: DNS rewrite, e.g. board.home -> $CT_IP
    - NAS backups: see the README section "Sending backups to the NAS".

EOF
