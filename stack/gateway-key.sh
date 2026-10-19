#!/usr/bin/env bash
# Manage OPENWA_API_KEY in stack/.env: the X-API-Key the BFF sends to the OpenWA gateway.
# Runs on the VM (/opt/wa), against the running openwa-api container. The key is never printed
# and never put on a command line (curl reads its header from stdin).
#
#   ./stack/gateway-key.sh                    # copy the engine's bootstrap ADMIN key into stack/.env (fallback)
#   printf %s "$KEY" | ./stack/gateway-key.sh --stdin   # install a key you supply: prefer an unscoped OPERATOR key
#                                             (the BFF creates sessions; session-scoped keys cannot)
#   ./stack/gateway-key.sh --check            # verify the key in stack/.env; exit 1 if rejected
#
# After changing the key: ./stack/wa up -d bff   (compose only re-reads .env on recreate)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/stack/.env"
GATEWAY="${OPENWA_CHECK_URL:-http://127.0.0.1:2785}"

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }

# 0 = accepted, 1 = rejected or empty, 2 = gateway unreachable
check_key() {
  local key="$1" code
  [ -n "$key" ] || return 1
  code=$(printf 'header = "X-API-Key: %s"\n' "$key" \
    | curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -K - "$GATEWAY/api/sessions" 2>/dev/null) || return 2
  case "$code" in
    2??) return 0 ;;
    401|403) return 1 ;;
    *) return 2 ;;
  esac
}

current_key() { grep -E '^OPENWA_API_KEY=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

report() {
  case "$1" in
    0) echo "ok   gateway accepts the OPENWA_API_KEY in stack/.env" ;;
    1) echo "FAIL gateway rejected the OPENWA_API_KEY in stack/.env (empty or stale)" >&2 ;;
    *) echo "FAIL could not reach the gateway at $GATEWAY (is openwa-api up?)" >&2 ;;
  esac
}

case "${1:-}" in
  --check)
    rc=0; check_key "$(current_key)" || rc=$?
    report "$rc"
    [ "$rc" != 1 ] || echo "     fix: ./stack/gateway-key.sh && ./stack/wa up -d bff" >&2
    exit $(( rc == 0 ? 0 : 1 ))
    ;;
  --stdin) IFS= read -r KEY || [ -n "$KEY" ] ;;   # `read` fails on a last line with no newline
  "")      KEY="$(docker exec -u openwa openwa-api cat /app/data/.api-key)" ;;
  *)       echo "usage: $0 [--check | --stdin]" >&2; exit 2 ;;
esac
KEY="${KEY//[$'\r\n ']/}"

rc=0; check_key "$KEY" || rc=$?
if [ "$rc" != 0 ]; then
  report "$rc"
  echo "     stack/.env left unchanged" >&2
  exit 1
fi

# Replace the line in place (umask 077: the file holds secrets), keep every other line as is.
umask 077
tmp="$(mktemp "$ENV_FILE.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
grep -vE '^OPENWA_API_KEY=' "$ENV_FILE" > "$tmp" || true
printf 'OPENWA_API_KEY=%s\n' "$KEY" >> "$tmp"
mv "$tmp" "$ENV_FILE"
trap - EXIT
echo "ok   OPENWA_API_KEY updated in stack/.env (verified against the gateway). Now: ./stack/wa up -d bff"
