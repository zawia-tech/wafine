#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$DIR/launch-check.sh"

# Test with agent mode and example hosts — expect STEP lines in the
# bootstrap.sh contract: STEP <name> <ok|failed|skipped> <detail>
out="$("$SCRIPT" --agent --target app.example.com --api api.example.com --docs docs.example.com 2>&1 || true)"
if ! printf '%s' "$out" | grep -qE '^STEP '; then
  echo "FAIL: expected STEP lines in --agent output"
  exit 1
fi
if ! printf '%s' "$out" | grep -qE '^STEP dns-web '; then
  echo "FAIL: expected STEP dns-web line"
  exit 1
fi

# Test with unreachable hosts (should fail overall, exit non-zero, and emit
# a final NEXT-ACTION line)
tmpfile="$(mktemp)"
set +e
"$SCRIPT" --agent --target invalid.invalid --api invalid.invalid --docs invalid.invalid >"$tmpfile" 2>&1
exit_code=$?
set -e
if [[ $exit_code -eq 0 ]]; then
  echo "FAIL: expected non-zero exit for unreachable hosts"
  rm -f "$tmpfile"
  exit 1
fi
if ! grep -qE '^NEXT-ACTION: ' "$tmpfile"; then
  echo "FAIL: expected NEXT-ACTION line on failure"
  rm -f "$tmpfile"
  exit 1
fi
if ! grep -qE '^STEP dns-web failed ' "$tmpfile"; then
  echo "FAIL: expected STEP dns-web failed line"
  rm -f "$tmpfile"
  exit 1
fi
rm -f "$tmpfile"

exit 0
