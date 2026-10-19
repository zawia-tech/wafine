#!/usr/bin/env bash
# CONFIG:<key> reporting. Values are never printed — only the source that
# satisfied each key (env, .env, pass) or "missing". Ports are defaults, not
# secrets, so they report their default instead of a source.
# Sourced by bootstrap.sh; reads ROOT, AGENT, MODE from lib.sh.
# shellcheck disable=SC2034

# Pass paths named in the docs (docs/11-bootstrap.md, "CONFIG keys"). Extend as docs add more.
pass_path_for() {
  case "$1" in
    OPENWA_API_KEY) echo "accounts/openwa/wafine/api-key" ;;
    *) return 1 ;;
  esac
}

# Print the source that satisfies <key>: env | .env | pass | missing.
config_source() {
  local key="$1" file path
  if [ -n "$(printenv "$key" 2>/dev/null || true)" ]; then
    echo env; return 0
  fi
  for file in "$ROOT/stack/.env" "$ROOT/.env"; do
    if [ -f "$file" ] && grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" 2>/dev/null; then
      echo ".env"; return 0
    fi
  done
  path="$(pass_path_for "$key" 2>/dev/null || true)"
  if [ -n "$path" ] && tool_ok pass && pass show "$path" >/dev/null 2>&1; then
    echo pass; return 0
  fi
  echo missing
}

# Required keys per mode; check and dev fall back to localhost/dev defaults.
required_keys() {
  case "$1" in
    vm)    echo "PUBLIC_API_URL WEB_URL OPENWA_API_KEY" ;;
    cloud) echo "SITE_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_DOCS_URL" ;;
    *)     echo "" ;;
  esac
}

is_required() {
  case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

CONFIG_KEYS="SITE_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_DOCS_URL PUBLIC_API_URL WEB_URL OPENWA_API_KEY"

config_report() {
  local fail=0 required key src
  required="$(required_keys "$MODE")"
  for key in $CONFIG_KEYS; do
    src="$(config_source "$key")"
    if [ "$src" != missing ]; then
      log_step "CONFIG:$key" ok "$src"
    elif [ "$MODE" = check ] || [ "$MODE" = dev ]; then
      log_step "CONFIG:$key" skipped "missing (not required in $MODE)"
    elif is_required "$key" "$required"; then
      log_step "CONFIG:$key" failed "missing (required in $MODE)"
      fail=1
    else
      log_step "CONFIG:$key" skipped "missing (not required in $MODE)"
    fi
  done
  # Ports are dev defaults, not secrets.
  log_step "CONFIG:BFF_PORT" ok "default=${BFF_PORT:-4000}"
  log_step "CONFIG:WEB_PORT" ok "default=${WEB_PORT:-3000}"
  if [ "$fail" = 1 ]; then
    fail_next "set the required CONFIG keys for mode '$MODE' (see .env.example) and re-run"
  fi
}
