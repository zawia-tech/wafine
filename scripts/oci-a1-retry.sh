#!/usr/bin/env bash
# Ampere A1 launches often fail with "Out of host capacity", and af-casablanca-1 has a single
# availability domain, so there is no other AD to fall back to. This shows the plan once, asks for
# confirmation, then retries `apply` on capacity/throttling errors only.
#
#   scripts/oci-a1-retry.sh [delay-seconds]      # default 120; MAX_TRIES=200
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TF="$ROOT/tf"                               # keeps .terraform out of the working tree (see scripts/tf)
. "$ROOT/lib/os.sh"                         # portable date/time helpers (macOS BSD vs Linux GNU)
DELAY="${1:-120}"
MAX="${MAX_TRIES:-200}"

"$TF" oci init -input=false >/dev/null || exit 1
"$TF" oci plan -input=false || exit 1
read -r -p "Apply this plan, retrying on capacity errors? [y/N] " yn
[ "$yn" = y ] || exit 0

# A bash-native counter loop, not `seq`: seq is not POSIX and is missing from
# minimal images (and `eval echo {1..N}` breaks on non-numeric MAX_TRIES).
for ((i = 1; i <= MAX; i++)); do
  echo "[$(date -Is)] attempt $i"
  if out="$("$TF" oci apply -auto-approve -input=false 2>&1)"; then
    echo "$out" | tail -15
    exit 0
  fi
  if echo "$out" | grep -qiE 'LimitExceeded|QuotaExceeded|service limit'; then
    echo "$out" | tail -20
    echo "✗ tenancy limit/quota hit — not a capacity issue. Check Always Free limits (2 OCPU / 12 GB A1)."
    exit 1
  fi
  if echo "$out" | grep -qiE 'out of (host )?capacity|TooManyRequests|429'; then
    echo "  no capacity yet — sleeping ${DELAY}s"
    sleep "$DELAY"
    continue
  fi
  echo "$out" | tail -40
  exit 1
done
echo "gave up after $MAX attempts"
exit 1
