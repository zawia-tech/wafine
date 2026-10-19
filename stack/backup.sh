#!/usr/bin/env bash
# Backs up what Supabase does NOT already hold, then ships it to the private backups bucket
# (`openwa-backups` in the S3-compatible object store; local-only until object-store keys are set).
#   openwa-data-<ts>.tar.gz : /app/data minus caches — main.sqlite.snapshot (API keys + audit, ALWAYS SQLite),
#                             WhatsApp auth state (sessions/ or baileys/), .api-key, .env.generated, plugins
#   openwa-db-<ts>.dump     : pg_dump of the `openwa` schema only (Supabase's own daily backups cover
#                             the whole project; this is a portable copy)
#
# Why not OpenWA/scripts/backup.sh: its pg_dump has no --schema filter, so with the least-privilege
# `openwa` role it fails on Supabase-owned schemas (auth, storage, ...).
#
# Session auth state = account takeover material. Set BACKUP_AGE_RECIPIENT (an `age` public key) in
# stack/.env to encrypt archives before upload.
#
# Cron (installed by scripts/deploy.sh):  17 3 * * *  ubuntu  /opt/wa/stack/backup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/stack/.env"; set +a
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$ROOT/backups"
mkdir -p "$OUT"
log() { echo "[$(date -Is)] $*"; }

# Object storage = any S3-compatible store. S3_PROVIDER=Other (default) is the plain-S3 shape OCI
# Object Storage and MinIO speak; Cloudflare R2 sets its own provider quirks. Path style
# (S3_FORCE_PATH_STYLE, default true) is required for OCI (no virtual-host addressing).
# Secrets go to containers by NAME (-e VAR), never as -e VAR=value, so they don't show up in `ps`.
# NO_CHECK_BUCKET: store keys may be scoped to two buckets without list/create rights.
export RCLONE_CONFIG_STORE_TYPE=s3 RCLONE_CONFIG_STORE_PROVIDER="${S3_PROVIDER:-Other}"
export RCLONE_CONFIG_STORE_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}" RCLONE_CONFIG_STORE_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_STORE_ENDPOINT="${S3_ENDPOINT:-}" RCLONE_CONFIG_STORE_REGION="${S3_REGION:-auto}"
export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}" RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}"
rclone() {
  docker run --rm ${RCLONE_MOUNT:+-v "$RCLONE_MOUNT"} \
    -e RCLONE_CONFIG_STORE_TYPE -e RCLONE_CONFIG_STORE_PROVIDER -e RCLONE_CONFIG_STORE_FORCE_PATH_STYLE \
    -e RCLONE_CONFIG_STORE_NO_CHECK_BUCKET -e RCLONE_CONFIG_STORE_ENDPOINT -e RCLONE_CONFIG_STORE_REGION \
    -e RCLONE_CONFIG_STORE_ACCESS_KEY_ID -e RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY \
    rclone/rclone:latest "$@"
}
HAVE_STORE=0
[ -n "${S3_ENDPOINT:-}" ] && [ -n "${S3_ACCESS_KEY_ID:-}" ] && [ -n "${S3_SECRET_ACCESS_KEY:-}" ] && HAVE_STORE=1

log "consistent copy of main.sqlite"
docker exec -u openwa openwa-api sh -c \
  'sqlite3 /app/data/main.sqlite ".backup /app/data/main.sqlite.snapshot"'

log "archiving /app/data"
# GNU tar exits 1 when a live file changed while being read (Chromium profile); that is expected.
set +e
docker exec -u openwa openwa-api tar -C /app/data -czf - \
  --warning=no-file-changed \
  --exclude='./media' --exclude='./backups' --exclude='*/Cache' --exclude='*/Code Cache' --exclude='*/GPUCache' \
  --exclude='*/Service Worker/CacheStorage' --exclude='*/SingletonLock' \
  . > "$OUT/openwa-data-$TS.tar.gz"
rc=$?
set -e
[ "$rc" -le 1 ] || { log "tar failed ($rc)"; exit "$rc"; }
docker exec -u openwa openwa-api rm -f /app/data/main.sqlite.snapshot

log "pg_dump schema $POSTGRES_SCHEMA"
export PGPASSWORD="$DATABASE_PASSWORD"
docker exec -u openwa -e PGPASSWORD -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/certs/supabase-ca.crt \
  openwa-api pg_dump -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USERNAME" -d "$DATABASE_NAME" \
  -n "$POSTGRES_SCHEMA" --no-owner --no-privileges -Fc > "$OUT/openwa-db-$TS.dump"
unset PGPASSWORD

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  log "encrypting with age"
  for f in "$OUT/openwa-data-$TS.tar.gz" "$OUT/openwa-db-$TS.dump"; do
    age -r "$BACKUP_AGE_RECIPIENT" -o "$f.age" "$f" && rm -f "$f"
  done
fi

if [ "$HAVE_STORE" = 1 ]; then
  log "uploading to ${BACKUP_BUCKET:-openwa-backups}/$(hostname)/"
  RCLONE_MOUNT="$OUT:/backups:ro" rclone copy /backups "store:${BACKUP_BUCKET:-openwa-backups}/$(hostname)/" --include "*-$TS.*"
else
  log "WARNING: no object-store keys in stack/.env, backup kept on the VM only ($OUT)"
fi

log "pruning local copies older than 7 days"
find "$OUT" -type f -mtime +7 -delete
log "done"
