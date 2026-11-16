#!/usr/bin/env bash
# Tempo — one-time server setup for Ubuntu 22.04 / 24.04
#   cd tempo && sudo bash deploy/install-ubuntu.sh
# Installs Docker, opens the firewall (SSH/80/443), writes .env, starts PostgreSQL + app + Caddy (HTTPS),
# and schedules a daily database backup. Safe to run again (keeps an existing .env).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run with sudo:  sudo bash deploy/install-ubuntu.sh"; exit 1; fi
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
echo "== Tempo setup in $APP_DIR"

# 1) Docker Engine + compose plugin (official repository)
if ! command -v docker >/dev/null 2>&1; then
  echo "== Installing Docker"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
docker compose version >/dev/null

# 2) Firewall: only SSH, HTTP, HTTPS
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  echo "== Firewall: SSH, 80, 443 open"
fi

# 3) .env (created once; secrets generated here, never committed)
if [[ ! -f .env ]]; then
  read -rp "Domain for the website (DNS A record must point to this server, e.g. app.example.com): " DOMAIN
  [[ -z "$DOMAIN" ]] && { echo "A domain is required for HTTPS"; exit 1; }
  cat > .env <<EOF
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_REPLICAS=2
DB_POOL_MAX=20
# 0 = only accounts created by an admin (create-user.js) or invited by email can sign up
ALLOW_SIGNUP=0
SESSION_DAYS=30
EOF
  chmod 600 .env
  echo "== Wrote .env (DOMAIN=${DOMAIN}, ALLOW_SIGNUP=0)"
else
  echo "== Keeping existing .env"
fi

# 4) folders for import files and backups
mkdir -p restore backups
chmod 700 backups

# 5) build + start
echo "== Building and starting (first build takes a few minutes)"
docker compose up -d --build

echo -n "== Waiting for the app"
for i in $(seq 1 60); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then echo " ✓"; break; fi
  echo -n "."; sleep 3
  [[ $i -eq 60 ]] && { echo; echo "App did not become healthy — check: docker compose logs app"; exit 1; }
done

# 6) daily database backup at 02:30 (keeps 14 days)
chmod +x deploy/backup.sh
CRON="30 2 * * * cd ${APP_DIR} && bash deploy/backup.sh >> ${APP_DIR}/backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "deploy/backup.sh" ; echo "$CRON" ) | crontab -
echo "== Daily backup scheduled (02:30) → ${APP_DIR}/backups"

DOMAIN_NOW=$(grep -E '^DOMAIN=' .env | cut -d= -f2)
cat <<EOF

✓ Tempo is running:  https://${DOMAIN_NOW}
  (HTTPS certificate is issued automatically on the first visit — needs the domain's DNS to point here)

Next steps:
  1) Create the first account:
       docker compose exec app node server/scripts/create-user.js <email> "<first name>" "<last name>"
  2) Copy the Tempo .xlsx files into ${APP_DIR}/restore/ and import them:
       docker compose exec app node server/scripts/import-workspace.js restore/<file>.xlsx <email>
EOF
