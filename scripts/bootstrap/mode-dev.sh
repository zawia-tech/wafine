#!/usr/bin/env bash
# dev mode: install the Bun apps, ensure stack/.env exists, bring up the local
# compose stack (the one the Makefile already defines) and run stack-check.
# Sourced by bootstrap.sh.
# shellcheck disable=SC2034,SC2154

mode_dev() {
  local rel out apps=(app/web app/bff app/docs) fail=0
  for rel in "${apps[@]}"; do
    if [ ! -f "$ROOT/$rel/package.json" ]; then
      log_step bun-install skipped "no package.json ($rel)"
      continue
    fi
    if [ "$DRY" -eq 1 ]; then
      log_step bun-install ok "would run bun install --frozen-lockfile ($rel)"
      continue
    fi
    if ( cd "$ROOT/$rel" && bun install --frozen-lockfile ); then
      log_step bun-install changed "installed deps ($rel)"
    else
      log_step bun-install failed "bun install failed ($rel)"
      fail=1
    fi
  done
  [ "$fail" -eq 0 ] || fail_next "bun install failed — fix the lockfile/deps and re-run dev"

  # The VM runtime env; created from the documented example only when absent.
  if [ -f "$ROOT/stack/.env" ]; then
    log_step stack-env ok "stack/.env already present"
  elif [ "$DRY" -eq 1 ]; then
    log_step stack-env ok "would create stack/.env from stack/.env.example"
  else
    cp "$ROOT/stack/.env.example" "$ROOT/stack/.env"
    log_step stack-env changed "created stack/.env from stack/.env.example"
  fi

  # Reuse the Makefile's local stack (local/docker-compose.local.yml + local/.env.local).
  if [ "$DRY" -eq 1 ]; then
    log_step local-stack ok "would run: make local-up"
  elif [ ! -f "$ROOT/OpenWA/docker-compose.yml" ]; then
    log_step local-stack failed "OpenWA submodule missing"
    fail_next "git -C \"$ROOT\" submodule update --init --depth 1 OpenWA   # then re-run dev"
  elif ( cd "$ROOT" && make local-up ); then
    log_step local-stack changed "make local-up"
  else
    log_step local-stack failed "make local-up failed"
    fail_next "the local stack failed to start — check docker and local/ logs"
  fi

  # Assert the wiring; a failure here fails the dev step.
  if [ "$DRY" -eq 1 ]; then
    log_step stack-check ok "would run: scripts/stack-check"
  elif out="$("$ROOT/scripts/stack-check" 2>&1)"; then
    log_step stack-check ok "scripts/stack-check passed"
  else
    log_step stack-check failed "scripts/stack-check failed"
    [ "$AGENT" -eq 1 ] || printf '%s\n' "$out"
    fail_next "fix the stack wiring (scripts/stack-check) then re-run dev"
  fi
}
