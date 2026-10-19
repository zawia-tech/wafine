#!/usr/bin/env bash
# Run on the VM BEFORE the first `./stack/wa up -d`. Proves, with the real credentials, that:
#   1. stack/.env has every required value
#   2. the Supabase pooler's TLS certificate verifies against stack/certs/supabase-ca.crt (incl. hostname)
#   3. the `openwa` role can log in through Supavisor, search_path lands in `openwa`, TimeZone is UTC,
#      and it may CREATE in the schema (OpenWA runs its own migrations at boot)
#   4. the object store (S3-compatible: OCI Object Storage with S3_PROVIDER=Other, Cloudflare R2
#      with S3_PROVIDER=Cloudflare) accepts the keys and both buckets are reachable
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CA="$ROOT/stack/certs/supabase-ca.crt"
set -a; . "$ROOT/stack/.env"; set +a

# Object storage = any S3-compatible store. S3_PROVIDER=Other (default) is the plain-S3 shape OCI
# Object Storage and MinIO speak; Cloudflare R2 sets its own provider quirks.
# Path style (S3_FORCE_PATH_STYLE, default true) is required for OCI: its compat endpoint has no
# virtual-host form. Secrets go to containers by NAME (-e VAR), never as -e VAR=value, so they
# don't show up in `ps`. NO_CHECK_BUCKET: store keys may be scoped to two buckets without
# bucket-list/create rights (R2 tokens; OCI Customer Secret Keys are account-wide and can list).
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

ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

echo "1. stack/.env"
for v in DATABASE_HOST DATABASE_USERNAME DATABASE_PASSWORD POSTGRES_SCHEMA BASE_URL; do
  [ -n "${!v:-}" ] && ok "$v set" || fail "$v is empty"
done
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] && ok "CLOUDFLARE_TUNNEL_TOKEN set (public hostname on)" \
  || echo "  info CLOUDFLARE_TUNNEL_TOKEN empty: Tailscale-only mode, cloudflared will not start"
[ -f "$CA" ] && ok "CA file present" || fail "missing $CA"

echo "2. TLS to $DATABASE_HOST:$DATABASE_PORT"
if echo | openssl s_client -starttls postgres -connect "$DATABASE_HOST:$DATABASE_PORT" \
     -CAfile "$CA" -verify_hostname "$DATABASE_HOST" -verify_return_error 2>/dev/null | grep -q 'Verify return code: 0'; then
  ok "certificate chain + hostname verified"
else
  fail "TLS verification failed — re-download the CA (Database > Settings > SSL), or as a last resort set DATABASE_SSL_REJECT_UNAUTHORIZED=false"
fi

echo "3. Postgres login as $DATABASE_USERNAME via the pooler"
SQL="select current_user, current_setting('search_path'), current_setting('TimeZone'),
            has_schema_privilege('$POSTGRES_SCHEMA','CREATE')"
export PGPASSWORD="$DATABASE_PASSWORD"
if out=$(docker run --rm -e PGPASSWORD -v "$CA:/ca.crt:ro" postgres:17-alpine \
      psql "host=$DATABASE_HOST port=$DATABASE_PORT dbname=$DATABASE_NAME user=$DATABASE_USERNAME sslmode=verify-full sslrootcert=/ca.crt options='-c search_path=$POSTGRES_SCHEMA,public'" \
      -At -F ' | ' -c "$SQL" 2>&1); then
  echo "       $out"
  [[ "$out" == *"| $POSTGRES_SCHEMA"* ]] && ok "search_path starts with $POSTGRES_SCHEMA" || fail "search_path not set to $POSTGRES_SCHEMA"
  [[ "$out" == *"| UTC |"* ]] && ok "TimeZone UTC" || fail "TimeZone is not UTC"
  [[ "$out" == *"| t" ]] && ok "CREATE on schema $POSTGRES_SCHEMA" || fail "role lacks CREATE on $POSTGRES_SCHEMA"
else
  echo "$out" | sed 's/^/       /'
  fail "cannot connect (wrong password? role not LOGIN? migration not applied?)"
fi

echo "4. Object storage (${S3_PROVIDER:-Other})"
if [ "$HAVE_STORE" = 1 ]; then
  for b in "${S3_BUCKET:-openwa-media}" "${BACKUP_BUCKET:-openwa-backups}"; do
    if rclone lsf "store:$b" --max-depth 1 >/dev/null 2>&1; then
      ok "bucket $b reachable"
    else
      fail "bucket $b not reachable (keys, endpoint, token bucket scope, or bucket missing)"
    fi
  done
elif [ "${STORAGE_TYPE:-local}" = s3 ]; then
  fail "STORAGE_TYPE=s3 but S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not all set"
else
  echo "  info no object-store keys yet: media stays local (STORAGE_TYPE=${STORAGE_TYPE:-local}), backups stay on the VM"
fi

echo
[ "$FAILED" = 0 ] && echo "Preflight passed." || { echo "Preflight FAILED — fix the items above before starting OpenWA."; exit 1; }
