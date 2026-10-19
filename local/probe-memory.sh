#!/usr/bin/env bash
# Measure per-engine memory under identical conditions.
#
# The whole reason this test exists: the OCI/AWS instance size is chosen by RAM, and
# the only free-tier Graviton size is t4g.small (2 GB). stack/compose.infra.yml asks
# for 8g. So the question "does a browserless engine fit in 2 GB?" decides whether
# staging costs money. This script answers it with a number instead of an opinion.
#
# Usage:
#   ./local/probe-memory.sh owa-webjs owa-baileys      # sample running stacks
#   ./local/probe-memory.sh owa-webjs 30               # 30 samples, 2s apart
#
# Report RSS, not just the cgroup total: Chromium spawns many processes, and a
# container-level number alone hides whether the browser is actually running.

set -uo pipefail
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-2}"

[ "$#" -ge 1 ] || { echo "usage: $0 <compose-project> [samples]" >&2; exit 1; }

PROJECT="$1"
SAMPLES="${2:-15}"

container="$(docker ps --filter "label=com.docker.compose.project=${PROJECT}" --format '{{.Names}}' | head -1)"
[ -n "$container" ] || { echo "FAIL: no running container for project '${PROJECT}'" >&2; exit 1; }

engine="$(docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | sed -n 's/^ENGINE_TYPE=//p')"

printf '\n== %s (%s) ==\n' "$PROJECT" "${engine:-unknown}"

peak_mem=0
peak_procs=0
sum_mem=0

for i in $(seq 1 "$SAMPLES"); do
  # cgroup memory.current / limit, straight from the kernel — not an estimate.
  read -r cur lim < <(docker exec "$container" sh -c \
    'cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.max 2>/dev/null | tr "\n" " "' 2>/dev/null) || true
  procs="$(docker exec "$container" sh -c 'ls /proc | grep -c "^[0-9]*$"' 2>/dev/null || echo 0)"

  [ -n "${cur:-}" ] && [ "$cur" -gt "$peak_mem" ] 2>/dev/null && peak_mem="$cur"
  [ "$procs" -gt "$peak_procs" ] 2>/dev/null && peak_procs="$procs"
  sum_mem=$((sum_mem + ${cur:-0}))

  printf '  [%2d/%2d] mem %6s MB   procs %3s\n' \
    "$i" "$SAMPLES" "$(( ${cur:-0} / 1024 / 1024 ))" "$procs"
  sleep "$SAMPLE_INTERVAL"
done

avg_mem=$((sum_mem / SAMPLES))

cat <<EOF

  avg cgroup memory : $((avg_mem / 1024 / 1024)) MB
  peak cgroup memory: $((peak_mem / 1024 / 1024)) MB
  limit             : $(( ${lim:-0} / 1024 / 1024 )) MB
  peak processes    : ${peak_procs}

  VERDICT for t4g.small (2 GB, the only free Graviton size):
EOF

# Leave headroom for the OS, Docker, and the cloud-init/SSM agents — a stack that
# exactly fills 2 GB is a stack that gets OOM-killed under load.
if [ "$peak_mem" -lt $((1400 * 1024 * 1024)) ]; then
  echo "    FITS — peak is under 1.4 GB, leaving headroom for the host."
elif [ "$peak_mem" -lt $((1800 * 1024 * 1024)) ]; then
  echo "    TIGHT — fits at idle, but one more session or a media burst may OOM."
else
  echo "    DOES NOT FIT — t4g.small will OOM. Needs t4g.large (8 GB), which is NOT free."
fi
echo
cat <<'EOF'
  NOTE: this number is only meaningful with a session LINKED and WORKING.
  At 'qr_ready' the engine is loaded but not authenticated, so treat it as the
  floor: media sends and busy chats push it higher. Check the session state:
    curl -H "X-API-Key: $KEY" http://127.0.0.1:<port>/api/sessions
EOF
