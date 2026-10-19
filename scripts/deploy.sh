#!/usr/bin/env bash
# Ship the OpenWA source checkout + stack/ + app/bff/ to the VM over Tailscale SSH, build the images
# THERE (OpenWA/Dockerfile and app/bff/Dockerfile, native arm64 on Ampere A1), run the preflight,
# then (re)start. The BFF + its Redis run next to the engine and reach it as http://openwa-api:2785
# over the compose network; the BFF is not published on any non-loopback interface.
#
#   scripts/deploy.sh [host]                  # default: wafine-vm (MagicDNS on the tailnet)
#   PUSH_ENV=1 scripts/deploy.sh              # replace the VM's stack/.env with the local one
#
# SSH transport is direct by default: a workstation already on the VM's tailnet resolves
# `wafine-vm` via MagicDNS. To deploy from a workstation on a *different* tailnet, start
# `scripts/tailnet-sidecar` and export the proxy opt-in before deploying:
#   DEPLOY_SSH_OPTS="-o ProxyCommand='nc -X 5 -x 127.0.0.1:1055 %h %p'"
# When set, DEPLOY_SSH_OPTS is prepended to every ssh/rsync call; when empty, no proxy is used.
#
# stack/.env (git-ignored, mode 600) is copied to the VM only when the VM has none yet, or when
# PUSH_ENV=1. Its contents are never printed. After the first deploy the VM copy is authoritative.
#
# Deploys only move forward: the VM records what it runs (/opt/wa/.deployed-commit: commit +
# content fingerprint of app/bff, stack and the OpenWA pin). A checkout whose history does not
# contain that content is refused, so a deploy from a stale folder or branch cannot silently roll
# the server back. The check is by content, not commit id, because PRs are squash-merged: main's
# squash commit carries the same trees as the branch commit that was deployed before the merge.
# ALLOW_ROLLBACK=1 makes a deliberate rollback possible. Uncommitted changes are refused too (what
# ships must be a commit); ALLOW_DIRTY=1 overrides.
set -euo pipefail
SSH_HOST="${1:-wafine-vm}"
TARGET="ubuntu@$SSH_HOST"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Opt-in proxy: split DEPLOY_SSH_OPTS into argv so `-o ProxyCommand='…'` reaches ssh as one
# option instead of literal quote characters. Empty by default (direct tailnet).
SSH_OPTS=()
if [ -n "${DEPLOY_SSH_OPTS:-}" ]; then
  # shellcheck disable=SC2086,SC2294
  eval "SSH_OPTS=($DEPLOY_SSH_OPTS)"
fi
# rsync parses its -e string itself, so it wants the raw quoted form.
RSYNC_SSH="ssh${DEPLOY_SSH_OPTS:+ $DEPLOY_SSH_OPTS}"
# --match 'v*': the repo also carries SDK tags (java-sdk-v…, sdk/go/…) that would otherwise win.
REF="$(git -C "$ROOT/OpenWA" describe --tags --match 'v*' --always 2>/dev/null || echo main)"

# The OpenWA rsync below uses --delete: an uninitialised submodule would wipe the VM's source.
if [ ! -f "$ROOT/OpenWA/docker-compose.yml" ]; then
  echo "✗ $ROOT/OpenWA is empty. Run: git -C \"$ROOT\" submodule update --init --depth 1 OpenWA" >&2
  exit 1
fi

HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
if [ -n "$(git -C "$ROOT" status --porcelain --ignore-submodules=dirty -- app/bff stack scripts OpenWA)" ] \
  && [ "${ALLOW_DIRTY:-0}" != 1 ]; then
  echo "✗ uncommitted changes under app/bff, stack, scripts or OpenWA: commit them first (ALLOW_DIRTY=1 overrides)" >&2
  exit 1
fi
# Fingerprint of exactly what ships: the app/bff and stack trees and the OpenWA submodule pin.
fingerprint() { for p in app/bff stack OpenWA; do git -C "$ROOT" rev-parse "$1:$p" 2>/dev/null; done | sha1sum | cut -c1-16; }
HEAD_FP="$(fingerprint HEAD)"
read -r DEPLOYED DEPLOYED_FP < <(ssh ${SSH_OPTS[@]+"${SSH_OPTS[@]}"} "$TARGET" 'cat /opt/wa/.deployed-commit 2>/dev/null || true'; echo) || true
if [ -n "${DEPLOYED:-}" ] && [ "${ALLOW_ROLLBACK:-0}" != 1 ]; then
  git -C "$ROOT" cat-file -e "$DEPLOYED^{commit}" 2>/dev/null || git -C "$ROOT" fetch -q origin || true
  [ -n "${DEPLOYED_FP:-}" ] || DEPLOYED_FP="$(fingerprint "$DEPLOYED" 2>/dev/null || true)"
  contained=0
  if git -C "$ROOT" merge-base --is-ancestor "$DEPLOYED" HEAD 2>/dev/null; then
    contained=1
  elif [ -n "${DEPLOYED_FP:-}" ]; then
    # Squash-merged: look for the deployed content in this checkout's recent history.
    for c in $(git -C "$ROOT" rev-list -n 300 HEAD); do
      if [ "$(fingerprint "$c")" = "$DEPLOYED_FP" ]; then contained=1; break; fi
    done
  fi
  if [ "$contained" != 1 ]; then
    echo "✗ the VM runs ${DEPLOYED:0:12} (content ${DEPLOYED_FP:-unknown}), which this checkout" >&2
    echo "  ($(git -C "$ROOT" rev-parse --abbrev-ref HEAD) @ ${HEAD_SHA:0:12}) does not contain." >&2
    echo "  Deploying would roll the server back. Pull/merge first, or deploy from the branch that has it." >&2
    echo "  Deliberate rollback: ALLOW_ROLLBACK=1 scripts/deploy.sh" >&2
    exit 1
  fi
fi
echo "→ app $(git -C "$ROOT" rev-parse --abbrev-ref HEAD) @ ${HEAD_SHA:0:12}${DEPLOYED:+ (VM had ${DEPLOYED:0:12})}"

echo "→ OpenWA $REF → $TARGET:/opt/wa"
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude '.git' --exclude 'node_modules' --exclude 'dashboard/node_modules' \
  --exclude 'data' --exclude 'dist' --exclude $'Icon\r' \
  "$ROOT/OpenWA/" "$TARGET:/opt/wa/OpenWA/"
rsync -az -e "$RSYNC_SSH" \
  --exclude '.env' --exclude $'Icon\r' \
  "$ROOT/stack/" "$TARGET:/opt/wa/stack/"
ssh ${SSH_OPTS[@]+"${SSH_OPTS[@]}"} "$TARGET" 'mkdir -p /opt/wa/app/bff'
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude 'node_modules' --exclude 'dist' --exclude '.env*' --exclude $'Icon\r' \
  "$ROOT/app/bff/" "$TARGET:/opt/wa/app/bff/"

if [ -f "$ROOT/stack/.env" ] && { [ "${PUSH_ENV:-0}" = 1 ] || ! ssh ${SSH_OPTS[@]+"${SSH_OPTS[@]}"} "$TARGET" test -f /opt/wa/stack/.env; }; then
  echo "→ installing stack/.env on the VM (mode 600, contents not shown)"
  ssh ${SSH_OPTS[@]+"${SSH_OPTS[@]}"} "$TARGET" 'umask 077; cat > /opt/wa/stack/.env' < "$ROOT/stack/.env"
fi

ssh ${SSH_OPTS[@]+"${SSH_OPTS[@]}"} "$TARGET" REF="$REF" HEAD_SHA="$HEAD_SHA" HEAD_FP="$HEAD_FP" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/wa
[ -f stack/.env ] || { echo "✗ /opt/wa/stack/.env missing — copy stack/.env.example and fill it in"; exit 1; }
# The VM is always Linux, so plain GNU `sed -i` is correct here.
sed -i "s/^OPENWA_REF=.*/OPENWA_REF=$REF/" stack/.env

./stack/preflight.sh
./stack/wa build openwa-api bff
./stack/wa up -d --remove-orphans
./stack/wa ps
echo "$HEAD_SHA $HEAD_FP" > /opt/wa/.deployed-commit

# The gateway's /api/health is public, so a stale OPENWA_API_KEY looks healthy. Test it for real.
./stack/gateway-key.sh --check || echo "⚠ BFF cannot authenticate to the gateway yet — see the fix line above"

# Nightly backup to Cloudflare R2 (openwa-backups bucket); local-only until R2 keys are set.
mkdir -p /opt/wa/backups
echo '17 3 * * * ubuntu /opt/wa/stack/backup.sh >> /opt/wa/backups/backup.log 2>&1' \
  | sudo tee /etc/cron.d/openwa-backup >/dev/null

# Dashboard + MCP for the tailnet only (Tailscale Serve hostname)
sudo tailscale serve --bg http://127.0.0.1:2785 >/dev/null
tailscale serve status
REMOTE
