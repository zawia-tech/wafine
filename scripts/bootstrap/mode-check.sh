#!/usr/bin/env bash
# check mode: verify prerequisites (done by bootstrap.sh) and render the real
# stack, propagating a stack-check failure instead of swallowing it.
# Sourced by bootstrap.sh.
# shellcheck disable=SC2034,SC2154

mode_check() {
  if [ ! -x "$ROOT/scripts/stack-check" ]; then
    log_step stack-check skipped "scripts/stack-check not found"
    return 0
  fi
  if [ "$DRY" -eq 1 ]; then
    log_step stack-check ok "would run: scripts/stack-check"
    return 0
  fi
  local out
  if out="$("$ROOT/scripts/stack-check" 2>&1)"; then
    log_step stack-check ok "scripts/stack-check passed"
  else
    log_step stack-check failed "scripts/stack-check failed"
    [ "$AGENT" -eq 1 ] || printf '%s\n' "$out"
    fail_next "fix the stack (often: git submodule update --init --depth 1 OpenWA) then re-run check"
  fi
}
