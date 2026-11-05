# Board of Bored

A self-hosted, single-user task board with two jobs:

1. **Capture:** log a task the moment you get it (quick-add bar on every page, works great on a phone).
2. **Paper trail:** keep a permanent record of everything you complete, with edit history, and pull PDF reports of what you accomplished.

Workspaces: **Rise Internet**, **Pitcher Technologies**, **Home**, plus an **All** view.

---

## Install on a Proxmox CT

### Quickest: one command on the Proxmox host

In the Proxmox web UI open *your node → Shell* and paste:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/codyp107/board-of-bored/main/proxmox-create-ct.sh)"
```

It creates a Debian 12 CT (next free ID, 2 cores, 1 GB RAM, 8 GB disk, DHCP, nesting + keyctl on, starts on boot),
asks for a root password for the CT console, then installs Board of Bored inside it and prints the URL.
Overrides: `CTID=150 IP=192.168.1.50/24 GW=192.168.1.1 STORAGE=local-zfs bash -c "$(curl ...)"`.

The manual route, if you prefer it:

### 1. Create the container (Proxmox web UI)

- **Template:** Debian 12 (standard)
- **Resources:** 1–2 cores, 1 GB RAM, 8 GB disk
- **Network:** static IP on your LAN (e.g. `192.168.1.50/24`), or a DHCP reservation in pfSense
- **Unprivileged:** yes (default)
- **Features:** after creating it, go to *CT → Options → Features* and tick **nesting** and **keyctl**
  (or from the Proxmox host shell: `pct set <CTID> -features nesting=1,keyctl=1`). Docker needs both.

Start the CT.

### 2. Run the installer (CT console, as root)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/codyp107/board-of-bored/main/install.sh)"
```

This installs Docker, clones the repo to `/opt/board-of-bored`, creates `.env`, builds and starts the app,
and schedules the nightly backup. The first build takes a few minutes.

### 3. Create your account

Open the URL the installer prints (e.g. `http://192.168.1.50`). The first visit shows a one-time **setup page**.
After you create the account, that page is gone for good: there is no registration.

> Alternative: set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` before the first start, then remove the password from `.env`.

### 4. Friendly name with AdGuard (optional)

In AdGuard Home → *Filters → DNS rewrites*, add `board.home` (or any name) → the CT's IP.
VPN clients need to use AdGuard as their DNS server for the name to work away from home.

---

## Updating

```bash
/opt/board-of-bored/update.sh
```

Pulls the latest code from GitHub and rebuilds. Your data in `/opt/board-of-bored/data` is never touched.

## Configuration

Edit `/opt/board-of-bored/.env`, then run `update.sh` (or `docker compose up -d`). See `.env.example` for every option:
port, timezone (default `America/Denver`), upload size limit (default 25 MB), report author name, backup location.

---

## Backups

`scripts/backup.sh` runs nightly at 2:30 AM (cron, installed by `install.sh`). Each run writes
`board-of-bored-YYYYMMDD-HHMMSS.tar.gz` containing a consistent SQLite snapshot (`board.db`) plus all attachments,
and keeps the newest 14 (`BACKUP_KEEP`).

### Sending backups to the NAS

Easiest with an unprivileged CT: mount the NAS on the **Proxmox host**, then bind-mount a folder into the CT.

1. Proxmox UI → *Datacenter → Storage → Add → NFS (or SMB/CIFS)* for your NAS share. It mounts at `/mnt/pve/<storage-id>`.
2. On the Proxmox host shell:
   ```bash
   mkdir -p /mnt/pve/<storage-id>/board-of-bored
   pct set <CTID> -mp0 /mnt/pve/<storage-id>/board-of-bored,mp=/mnt/nas/board-of-bored
   pct reboot <CTID>
   ```
3. In the CT's `.env`: `BACKUP_DIR=/mnt/nas/board-of-bored`

Unprivileged CT root writes as uid `100000` on the host, so the share must allow that user to write
(NFS: map all users to a writable account; SMB: mount with `uid=100000,gid=100000`).

Test it any time:

```bash
/opt/board-of-bored/scripts/backup.sh && ls -lh /mnt/nas/board-of-bored
```

Log: `/var/log/board-of-bored-backup.log`

### Restore

```bash
/opt/board-of-bored/scripts/restore.sh /mnt/nas/board-of-bored/board-of-bored-20261105-023000.tar.gz
```

It stops the app, moves the current data to `data.pre-restore-<time>` (nothing is lost), extracts the backup and restarts.

**Restoring onto a brand-new CT:** run the installer, then run `restore.sh` with your newest backup.

---

## Security notes

- Listens on the LAN only. Reach it from outside through your VPN; do **not** port-forward it in pfSense.
- One account; password hashed with **argon2id**. Sessions are random 256-bit tokens, stored only as SHA-256 hashes,
  in an HttpOnly, SameSite=Lax cookie (Secure when served over HTTPS). "Keep me signed in" lasts 90 days, otherwise 12 hours.
- Login rate limit: 5 failures per username or 10 per IP in 15 minutes.
- Attachments live in `data/attachments/` (not a public folder) and are only served through an authenticated route.
- Tasks, links, attachments and history can't be hard-deleted. The database itself refuses, through triggers.

### HTTPS (needed for "Install app" on phones)

Browsers only offer to install a PWA over HTTPS. Over plain `http://` the site works fully, and you can still
use *Share → Add to Home Screen* on iPhone. For HTTPS, put a reverse proxy in front with a certificate for a
name AdGuard resolves to the CT (e.g. Caddy or Nginx Proxy Manager with a DNS-challenge certificate for a subdomain
of a domain you own). `X-Forwarded-Proto` from the proxy is trusted automatically; uncomment `ADDRESS_HEADER` in `.env` so login rate limiting sees real client IPs.

---

## Development

Requires Node 22.

```bash
npm install
npm run dev      # http://localhost:5173 (data in ./data)
npm test         # data-layer, auth and date-range tests
npm run check    # type check
```

Stack: SvelteKit (Node adapter) · Svelte 5 · Tailwind 4 · SQLite via better-sqlite3 · argon2id · pdfmake.

**Why SQLite:** one user, one file, online backups with no downtime, and no second container to manage.
Postgres would add moving parts for no benefit at this scale.

Layout:

```
src/lib/dates.ts            date ranges, timezone math (tested)
src/lib/server/migrations.ts schema + no-delete triggers (append new migrations, never edit old ones)
src/lib/server/tasks.ts     all task reads/writes; every change writes history in the same transaction
src/lib/server/auth.ts      passwords, sessions, rate limiting
src/lib/server/pdf.ts       report PDF layout
src/routes/                 pages: /w/[ws], /w/[ws]/completed, /tasks/[id], /reports, /archive
scripts/                    backup.sh, restore.sh
```
