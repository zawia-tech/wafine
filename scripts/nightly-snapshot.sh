#!/usr/bin/env bash
# Connect to Supabase with $SUPABASE_DB_URL (secret; never printed) and record one snapshot row via
# ops.capture_health_snapshot(). Fails (non-zero) if the secret is missing or any query fails.
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL secret is not set}"
probes="${PROBES_JSON:-}"; [ -n "$probes" ] || probes='{}'
ok="${PROBES_OK:-true}"; [ -n "$ok" ] || ok=true

# Connection errors can echo the URL, so stderr is captured and only the first line is printed, with the
# URL and any postgres:// URI redacted. This keeps the error class (e.g. "permission denied", "row-level
# security policy") in the job log without leaking the secret.
err=$(mktemp); trap 'rm -f "$err"' EXIT
if ! out=$(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -X -q -At -F ' | ' \
  -v probes="$probes" -v ok="$ok" 2>"$err" <<'SQL'
select 'id', id, 'db_size_mb', round(db_size_bytes / 1048576.0, 1), 'newest_message_at', coalesce(newest_message_at::text, 'none'),
       'tables', table_counts::text
from ops.capture_health_snapshot(:'probes'::jsonb, :'ok'::boolean);
SQL
); then
  first=$(head -n1 "$err" | sed -E 's#postgres(ql)?://[^[:space:]]*#<redacted-url>#g')
  first=${first//"$SUPABASE_DB_URL"/<redacted-url>}
  echo "::error::Supabase snapshot failed: ${first:-no error output}"
  exit 1
fi
echo "snapshot: $out"
