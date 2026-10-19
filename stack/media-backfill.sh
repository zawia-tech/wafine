#!/usr/bin/env bash
# Moves media that is still inline in openwa.messages (base64 in metadata -> media -> data, written
# before the chat-media archive was on) into the private S3-compatible media bucket (OCI Object
# Storage by default; Cloudflare R2 and MinIO work identically), then lets the strip trigger
# drop the inline copy. docs/11-media-storage.md, "Existing media".
#
#   stack/media-backfill.sh                       dry run (the default): what would move, per
#                                                 mimetype, and the bytes that would leave Postgres
#   stack/media-backfill.sh --dry-run             the same thing, said explicitly
#   stack/media-backfill.sh --apply               full backup to the backups bucket first, then every row
#   stack/media-backfill.sh --apply --limit 10    stop after 10 rows; run again to resume
#   stack/media-backfill.sh --apply --batch 5     rows fetched from Postgres together (default 10)
#
# Idempotent: a crash at any point is safe — run again and it carries on, already-moved rows simply
# stop being candidates. Payloads are fetched from Postgres in batches of --batch rows (one round
# trip per batch instead of one per row); everything after that is still per row:
#   1. decode the payload to a temp file; size, MD5 and SHA-256
#   2. upload it to <S3_BUCKET>/<S3_KEY_PREFIX>chat-media/<sessionId>/<rowId>.<ext>, the layout OpenWA's
#      own archive uses. The key is deterministic: a re-run overwrites the same object with the same bytes.
#   3. verify the stored object: its size, plus its MD5 when the store reports one (single-part uploads
#      come back with an MD5 ETag on OCI and R2; a store that reports none is size-checked only)
#   4. point the row at it: UPDATE ... SET "mediaPath", "mediaMimetype" WHERE "mediaPath" IS NULL,
#      reading back the effect of the strip_archived_media trigger in the same round trip. OpenWA then
#      reads the file like media it archived itself (GET sessions/<id>/messages/<chat>/<msg>/media).
#   5. append id, key, size and SHA-256 to the manifest
# Left inline, untouched: URL pointers (no bytes), payloads that are not valid base64, rows OpenWA
# archived or revoked meanwhile. Nothing leaves Postgres except the inline copy of a verified file.
# The space Postgres hands back only after VACUUM FULL openwa.messages, a separate approved step.
#
# --apply first writes a pg_dump of the `openwa` schema (every message row, inline media included; no
# WhatsApp auth state, which never lives in Postgres) to <BACKUP_BUCKET>/<host>/, age-encrypted when
# BACKUP_AGE_RECIPIENT is set, and stops unless the uploaded size matches. The manifest goes next to it.
# Postgres returns the space only after VACUUM FULL openwa.messages, a separate approved step.
#
# Needs: /opt/wa with stack/.env (DATABASE_*, S3_*), the openwa-api container (psql, pg_dump, Supabase
# CA) running with STORAGE_TYPE=s3, docker for the rclone image, jq, and migration 20261018130000
# (the trigger) applied.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/stack/.env"; set +a

APPLY=0
LIMIT=0
BATCH=10
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --limit) LIMIT="${2:?--limit needs a number}"; shift ;;
    --batch) BATCH="${2:?--batch needs a number}"; shift ;;
    -h | --help) sed -n '2,37p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
[[ "$LIMIT" =~ ^[0-9]+$ ]] || { echo "--limit must be a number" >&2; exit 2; }
[[ "$BATCH" =~ ^[0-9]+$ && "$BATCH" -ge 1 ]] || { echo "--batch must be a number >= 1" >&2; exit 2; }
limit_sql=""
[ "$LIMIT" -gt 0 ] && limit_sql="limit $LIMIT"

TS=$(date -u +%Y%m%dT%H%M%SZ)
HOST=$(hostname)
OUT="$ROOT/backups"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
log() { echo "[$(date -Is)] $*"; }
die() { log "ERROR: $*"; exit 1; }

# psql inside openwa-api, TLS pinned to the Supabase CA. SQL comes on stdin and every value is a
# psql variable (-v name=value, used as :'name'), so nothing from a row is ever spliced into SQL.
export PGPASSWORD="$DATABASE_PASSWORD"
pg() {
  docker exec -i -u openwa -e PGPASSWORD -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/certs/supabase-ca.crt \
    openwa-api psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USERNAME" -d "$DATABASE_NAME" \
    -X -q -At -F $'\t' -v ON_ERROR_STOP=1 "$@"
}

# Same rclone setup as stack/backup.sh: secrets reach the container by name, never on the command line.
# S3_PROVIDER=Other suits an S3-compatible store (OCI Object Storage, MinIO); an R2 stack sets
# S3_PROVIDER=Cloudflare in stack/.env. Path style is what OCI needs and every store accepts.
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
# "<size> <md5>" of one stored object (the md5 is empty when the store does not report hashes),
# empty when the object does not exist.
remote_stat() {
  rclone lsjson --hash --hash-type md5 "store:$1" 2>/dev/null | jq -r '.[0] // empty | "\(.Size) \(.Hashes.md5 // "")"'
}

# OpenWA's extFromMimetype (modules/chat-media/chat-media-archive.service.ts): the subtype, `bin` if odd.
ext_for() {
  local sub
  [[ "$1" == */* ]] || { echo bin; return; }
  sub="${1#*/}"
  sub="${sub%%;*}"
  sub="$(printf '%s' "$sub" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | tr '[:upper:]' '[:lower:]')"
  [[ "$sub" =~ ^[a-z0-9]+$ ]] || { echo bin; return; }
  case "$sub" in
    jpeg) echo jpg ;;
    quicktime) echo mov ;;
    *) echo "$sub" ;;
  esac
}

KEY_ROOT="${S3_KEY_PREFIX:-media/}"
KEY_ROOT="${KEY_ROOT%/}/"
BUCKET="${S3_BUCKET:-openwa-media}"
BACKUP_BUCKET="${BACKUP_BUCKET:-openwa-backups}"

# Rows whose media bytes are still inline. The CASE guards the jsonb cast (a NUL escape or a non-JSON
# value would otherwise abort the whole query); such rows are reported and left alone.
CANDIDATES_SQL=$(cat <<'SQL'
with c as (
  select id, "sessionId" as sid, "createdAt",
         metadata is json object and position('\u0000' in metadata) = 0 as valid,
         case when metadata is json object and position('\u0000' in metadata) = 0
              then metadata::jsonb -> 'media' end as media
  from openwa.messages
  where "mediaPath" is null and type <> 'revoked' and position('"data"' in metadata) > 0
), inline as (
  select * from c
  where media ->> 'data' is not null and media ->> 'data' <> '' and media ->> 'data' !~* '^https?://'
    and coalesce(media ->> 'omitted', 'false') <> 'true' and coalesce(media ->> 'mimetype', '') <> ''
)
SQL
)

[ "$(pg <<<'show server_version_num;')" -ge 160000 ] || die "needs Postgres 16+ (IS JSON)"
storage_type="$(docker exec openwa-api printenv STORAGE_TYPE 2>/dev/null || true)"
trigger="$(pg <<<"select count(*) from pg_trigger where tgrelid = 'openwa.messages'::regclass and tgname = 'strip_archived_media' and not tgisinternal;")"

log "inline media by mimetype (rows, approx. decoded bytes):"
pg <<SQL
$CANDIDATES_SQL
select media ->> 'mimetype', count(*), sum(length(media ->> 'data')) * 3 / 4 from inline group by 1 order by 2 desc;
SQL
log "totals (rows to move, approx. bytes, rows left inline because the value is not valid jsonb):"
totals=$(pg <<SQL
$CANDIDATES_SQL
select (select count(*) from inline), (select coalesce(sum(length(media ->> 'data')) * 3 / 4, 0) from inline),
       (select count(*) from c where not valid);
SQL
)
printf '%s\n' "$totals"
t_rows="${totals%%$'\t'*}"; rest_t="${totals#*$'\t'}"; t_bytes="${rest_t%%$'\t'*}"
log "engine STORAGE_TYPE=${storage_type:-<unset>}  trigger strip_archived_media present: $trigger"
log "objects go to $BUCKET/${KEY_ROOT}chat-media/<sessionId>/<rowId>.<ext> via ${S3_ENDPOINT:-<no S3_ENDPOINT>}"

if [ "$APPLY" = 0 ]; then
  log "dry run: nothing written. ${t_bytes:-0} bytes would leave Postgres in ${t_rows:-0} rows (returned after VACUUM FULL openwa.messages). Re-run with --apply."
  exit 0
fi

[ -n "${S3_ENDPOINT:-}" ] && [ -n "${S3_ACCESS_KEY_ID:-}" ] && [ -n "${S3_SECRET_ACCESS_KEY:-}" ] \
  || die "S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY missing in stack/.env"
[[ "$S3_ENDPOINT" == https://* ]] || die "S3_ENDPOINT must be an https:// URL"
[ "$storage_type" = s3 ] || die "openwa-api runs with STORAGE_TYPE=${storage_type:-<unset>}: it could not read the moved files"
[ "$trigger" = 1 ] || die "trigger strip_archived_media missing: apply migration 20261018130000 first"

# ── 1. Full backup before anything changes ─────────────────────────────────────────────────
mkdir -p "$OUT"
dump="$OUT/pre-media-backfill-$TS.dump"
log "backup: pg_dump of schema ${POSTGRES_SCHEMA:-openwa}"
docker exec -u openwa -e PGPASSWORD -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/certs/supabase-ca.crt \
  openwa-api pg_dump -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USERNAME" -d "$DATABASE_NAME" \
  -n "${POSTGRES_SCHEMA:-openwa}" --no-owner --no-privileges -Fc > "$dump"
[ -s "$dump" ] || die "empty dump"
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$dump.age" "$dump" && rm -f "$dump"
  dump="$dump.age"
fi
remote="$BACKUP_BUCKET/$HOST/$(basename "$dump")"
RCLONE_MOUNT="$OUT:/backups:ro" rclone copyto "/backups/$(basename "$dump")" "store:$remote"
[ "$(remote_stat "$remote" | cut -d' ' -f1)" = "$(stat -c %s "$dump")" ] || die "backup upload not verified: $remote"
log "backup verified: $remote ($(stat -c %s "$dump") bytes)"

# ── 2. Move the rows (payloads fetched in batches of --batch) ─────────────────────────────
manifest="$OUT/media-backfill-$TS.tsv"
printf 'row_id\tsession_id\tstorage_key\tbytes\tsha256\tmimetype\n' > "$manifest"
pg > "$WORK/rows" <<SQL
$CANDIDATES_SQL
select id, sid, media ->> 'mimetype' from inline order by "createdAt", id $limit_sql;
SQL
moved=0
skipped=0
freed=0
batch_ids=()
batch_rows=()

# One batch = one psql round trip for every payload in it, then the same per-row handling as before.
flush_batch() {
  [ "${#batch_ids[@]}" -gt 0 ] || return 0
  local idlist line id sid mime key obj b64 size md5 sha updated rest state stored stored_size stored_md5 pad
  idlist=$(IFS=,; echo "${batch_ids[*]}")
  pg -v ids="$idlist" > "$WORK/payloads" <<'SQL'
select id, metadata::jsonb #>> '{media,data}' from openwa.messages
where id::text = any(string_to_array(:'ids', ',')) and "mediaPath" is null;
SQL
  for line in "${batch_rows[@]}"; do
    IFS=$'\t' read -r id sid mime <<<"$line"
    if ! [[ "$id" =~ ^[0-9a-f-]{36}$ && "$sid" =~ ^[0-9A-Za-z-]{1,64}$ ]]; then
      log "skip: unexpected row shape ($id)"; skipped=$((skipped + 1)); continue
    fi
    key="chat-media/$sid/$id.$(ext_for "$mime")"
    obj="$BUCKET/$KEY_ROOT$key"

    b64=$(awk -F'\t' -v id="$id" '$1 == id { print $2; exit }' "$WORK/payloads")
    if [ -z "$b64" ]; then
      log "skip $id: archived or changed meanwhile"; skipped=$((skipped + 1)); continue
    fi
    # Node's Buffer.from tolerates missing padding; GNU base64 does not.
    printf '%s' "$b64" | tr -d ' \n\r' > "$WORK/b64.clean"
    pad=$(( (4 - $(stat -c %s "$WORK/b64.clean") % 4) % 4 ))
    [ "$pad" -gt 0 ] && printf '%*s' "$pad" '' | tr ' ' '=' >> "$WORK/b64.clean"
    if ! base64 -d < "$WORK/b64.clean" > "$WORK/blob" 2>/dev/null || [ ! -s "$WORK/blob" ]; then
      log "skip $id: payload is not valid base64, kept inline"; skipped=$((skipped + 1)); continue
    fi
    size=$(stat -c %s "$WORK/blob")
    md5=$(md5sum "$WORK/blob" | cut -d' ' -f1)
    sha=$(sha256sum "$WORK/blob" | cut -d' ' -f1)

    RCLONE_MOUNT="$WORK:/work:ro" rclone copyto /work/blob "store:$obj"
    stored="$(remote_stat "$obj")"
    stored_size="${stored%% *}"
    stored_md5="${stored#* }"
    if [ "$stored_size" != "$size" ] || { [ -n "$stored_md5" ] && [ "$stored_md5" != "$md5" ]; }; then
      log "skip $id: upload not verified (store: '$stored', want: '$size $md5') on $obj, row unchanged"
      skipped=$((skipped + 1)); continue
    fi
    [ -n "$stored_md5" ] || log "note $id: store reported no MD5; verified by size only ($size bytes)"

    # Set the pointer and read back what the trigger made of the row, in one round trip. The read
    # comes from RETURNING: a SELECT in the same statement as the update runs on the pre-update
    # snapshot and would not see the row the update just wrote.
    state=$(pg -v id="$id" -v key="$key" -v mime="$mime" <<'SQL'
with u as (
  update openwa.messages set "mediaPath" = :'key', "mediaMimetype" = :'mime'
  where id = :'id' and "mediaPath" is null and type <> 'revoked'
  returning case when metadata is json object and position('\u0000' in metadata) = 0
                 then (metadata::jsonb -> 'media' ->> 'omitted') || ' ' ||
                      ((metadata::jsonb #>> '{media,data}') is null)::text
            end as st
)
select count(*)::text || ' ' || coalesce(max(st), '') from u;
SQL
)
    updated="${state%% *}"; rest="${state#* }"
    if [ "$updated" != 1 ]; then
      # OpenWA archived or revoked the row first; its own pointer wins, ours is an orphan.
      rclone deletefile "store:$obj" || true
      log "skip $id: row changed before the pointer was set"; skipped=$((skipped + 1)); continue
    fi
    [ "$rest" = "true true" ] || die "row $id points at $key but still holds its payload (trigger?)"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$sid" "$key" "$size" "$sha" "$mime" >> "$manifest"
    moved=$((moved + 1))
    freed=$((freed + size))
    log "moved $id -> $key ($size bytes)"
  done
  batch_ids=()
  batch_rows=()
}

# fd 3: the docker exec calls inside the batch read their own stdin, never the row list.
while IFS=$'\t' read -r -u 3 id sid mime; do
  batch_ids+=("$id")
  batch_rows+=("$id	$sid	$mime")
  if [ "${#batch_rows[@]}" -ge "$BATCH" ]; then flush_batch; fi
done 3< "$WORK/rows"
flush_batch

RCLONE_MOUNT="$OUT:/backups:ro" rclone copyto "/backups/$(basename "$manifest")" "store:$BACKUP_BUCKET/$HOST/$(basename "$manifest")"
log "done: $moved moved, $skipped skipped, $freed bytes taken out of openwa.messages."
log "Manifest: $manifest (also in $BACKUP_BUCKET/$HOST/). Run again to pick up anything skipped;"
log "reclaim the space with VACUUM FULL openwa.messages (separate step)."
