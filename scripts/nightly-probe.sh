#!/usr/bin/env bash
# Probe each HEALTH_URL_* target that is set. Unset/empty targets are skipped.
# Writes `probes` (JSON) and `ok` (true|false) to $GITHUB_OUTPUT when set. Exits 0 either way:
# the workflow fails later, after the snapshot row has been written.
set -u
ok=true
probes='{}'
for name in WEB API GATEWAY; do
  var="HEALTH_URL_$name"
  url="${!var:-}"
  key=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  if [ -z "$url" ]; then
    echo "skip $key (HEALTH_URL_$name not set)"
    probes=$(jq -c --arg k "$key" '. + {($k): "skipped"}' <<<"$probes")
    continue
  fi
  code=$(curl -sS -o /dev/null -L --max-time 20 --retry 2 --retry-delay 3 -w '%{http_code}' "$url" 2>/dev/null) || code=000
  if [[ "$code" =~ ^[23] ]]; then
    echo "ok   $key -> HTTP $code"
    res="ok"
  else
    echo "FAIL $key -> HTTP $code"
    res="fail: HTTP $code"
    ok=false
  fi
  probes=$(jq -c --arg k "$key" --arg v "$res" '. + {($k): $v}' <<<"$probes")
done
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { echo "probes=$probes"; echo "ok=$ok"; } >>"$GITHUB_OUTPUT"
else
  echo "$probes ok=$ok"
fi
