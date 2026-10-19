#!/usr/bin/env bash
# Hermetic tests for bootstrap.sh. No real toolchain is required: a stub bin dir
# is placed first on PATH so the prerequisite step passes in CI (where bun, tofu,
# supabase and vercel are absent). Only --dry-run and the guard are exercised, so
# nothing is installed, built or deployed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

STUB="$(mktemp -d)"
trap 'rm -rf "$STUB"' EXIT
for tool in git bun docker docker-compose tofu gh supabase vercel pass tailscale jq curl; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$STUB/$tool"
  chmod +x "$STUB/$tool"
done
export PATH="$STUB:$PATH"

fail=0
pass() { printf 'ok   %s\n' "$1"; }
bad()  { printf 'FAIL %s\n' "$1" >&2; fail=1; }

# assert_eq <actual> <expected> <label>
assert_eq() { if [ "$1" = "$2" ]; then pass "$3"; else bad "$3 (got '$1', want '$2')"; fi; }
# assert_contains <haystack> <needle> <label>
assert_contains() { if grep -qF -- "$2" <<<"$1"; then pass "$3"; else bad "$3 (missing '$2')"; fi; }

run() { PATH="$STUB:$PATH" bash ./bootstrap.sh "$@"; }
# capture stdout+exit status without tripping `set -e` on a non-zero exit
capture() { local _rc=0; out="$("$@" 2>&1)" || _rc=$?; rc="$_rc"; }

# 1. check --agent --dry-run: STEP lines + exit 0
capture run check --agent --dry-run
assert_eq "$rc" 0 "check --agent --dry-run exits 0"
assert_contains "$out" "STEP OS ok" "OS step present"
assert_contains "$out" "STEP bootstrap-done ok" "done step present"
n="$(grep -c '^STEP ' <<<"$out" || true)"
if [ "$n" -ge 5 ]; then pass "emits $n STEP lines"; else bad "too few STEP lines ($n)"; fi

# 2. dev --agent --dry-run: three 'would run bun install' lines + local stack
capture run dev --agent --dry-run
assert_eq "$rc" 0 "dev --agent --dry-run exits 0"
n="$(grep -c 'would run bun install --frozen-lockfile' <<<"$out" || true)"
assert_eq "$n" 3 "dev dry-run prints 3 bun install lines"
assert_contains "$out" "make local-up" "dev dry-run prints the local stack command"
assert_contains "$out" "scripts/stack-check" "dev dry-run prints the stack-check command"

# 3. prod guard: refuses without confirmation, exit 2, NEXT-ACTION
capture run vm --agent --target prod
assert_eq "$rc" 2 "prod guard exits 2"
assert_contains "$out" "NEXT-ACTION:" "prod guard emits NEXT-ACTION"

# 4. prod guard satisfied: passes the guard and proceeds (dry-run)
export WAFINE_PROD_CONFIRM=1 WAFINE_VM_HOST=example-host
export PUBLIC_API_URL=https://api.example.com WEB_URL=https://app.example.com OPENWA_API_KEY=x
capture run vm --agent --yes --target prod --dry-run
assert_eq "$rc" 0 "vm --target prod --dry-run exits 0 once confirmed"
assert_contains "$out" "STEP prod-guard ok" "prod guard passes with confirmations"
unset WAFINE_PROD_CONFIRM WAFINE_VM_HOST PUBLIC_API_URL WEB_URL OPENWA_API_KEY

# 5. vm without target: refuses with NEXT-ACTION
capture run vm --agent
if [ "$rc" -ne 0 ]; then pass "vm without target exits non-zero ($rc)"; else bad "vm without target should fail"; fi
assert_contains "$out" "NEXT-ACTION:" "vm without target emits NEXT-ACTION"

# 6. cloud --agent --dry-run: plans each module, never applies
export SITE_URL=https://app.example.com NEXT_PUBLIC_API_URL=https://api.example.com NEXT_PUBLIC_DOCS_URL=https://docs.example.com
capture run cloud --agent --dry-run
assert_eq "$rc" 0 "cloud --agent --dry-run exits 0"
assert_contains "$out" "scripts/tf oci plan" "cloud dry-run plans oci"
assert_contains "$out" "scripts/tf cloudflare plan" "cloud dry-run plans cloudflare"
assert_contains "$out" "scripts/tf aws plan" "cloud dry-run plans aws"
if grep -qE 'apply' <<<"$(grep '^STEP ' <<<"$out")"; then bad "cloud must never run apply"; else pass "cloud never runs apply"; fi

exit "$fail"
