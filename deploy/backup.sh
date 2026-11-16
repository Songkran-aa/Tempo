#!/usr/bin/env bash
# Tempo database backup (run from the project folder; installed as a daily cron job by install-ubuntu.sh)
#   bash deploy/backup.sh            -> backups/tempo-YYYYmmdd-HHMM.sql.gz, keeps the last 14 days
# Restore:  gunzip -c backups/<file>.sql.gz | docker compose exec -T db psql -U <POSTGRES_USER> -d <POSTGRES_DB>   (default: tempo)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
# database user/name come from .env (default: tempo)
PGU=$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || true)
PGD=$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- || true)
PGU=${PGU:-tempo}; PGD=${PGD:-tempo}
FILE="backups/tempo-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U "$PGU" -d "$PGD" --no-owner --clean --if-exists | gzip -9 > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"
find backups -name 'tempo-*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') ✓ $FILE ($(du -h "$FILE" | cut -f1))"
