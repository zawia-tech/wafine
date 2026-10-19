#!/usr/bin/env bash
# Shared helpers for the WAFINE bootstrapper. Source it, don't execute it:
#   . "$(dirname "${BASH_SOURCE[0]}")/scripts/bootstrap/lib.sh"
#
# bootstrap.sh sets the run context (AGENT, DRY, YES, MODE, TARGET, PROD_CONFIRM)
# and every scripts/bootstrap/mode-*.sh reads it from here. Defaults below keep the
# mode files self-consistent when shellcheck lints them on their own.
#
# This is a library: several variables are consumed by the scripts that source it,
# so "appears unused" (SC2034) and "not assigned" (SC2154) do not apply.
# shellcheck disable=SC2034

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

: "${AGENT:=0}" "${DRY:=0}" "${YES:=0}"
: "${MODE:=check}" "${TARGET:=}" "${PROD_CONFIRM:=}"
: "${FAMILY:=unknown}" "${DISTRO:=}" "${WSL:=0}"

# STEP <name> <ok|changed|failed|skipped> <detail> — the --agent contract.
# Without --agent the same information prints in a human-friendly column.
log_step() {
  local name="$1" status="$2" detail="${3:-}"
  if [ "$AGENT" -eq 1 ]; then
    printf 'STEP %s %s %s\n' "$name" "$status" "$detail"
  else
    printf '[%-7s] %-24s %s\n' "$status" "$name" "$detail"
  fi
}

# note: free text that must never pollute the machine-readable --agent stream.
note() {
  [ "$AGENT" -eq 1 ] || printf '%s\n' "$*"
}

# fail_next <message> [exit-code]: the last line an agent should read.
fail_next() {
  local msg="$1" code="${2:-1}"
  printf 'NEXT-ACTION: %s\n' "$msg"
  exit "$code"
}

tool_ok() { command -v "$1" >/dev/null 2>&1; }

# step_run <name> <cmd...>: dry-run prints "would run: <cmd>"; otherwise runs it.
# argv form (no eval), so a target string can never smuggle in a command.
step_run() {
  local name="$1"; shift
  if [ "$DRY" -eq 1 ]; then
    log_step "$name" ok "would run: $*"
    return 0
  fi
  local out
  if [ "$AGENT" -eq 1 ]; then
    if out="$("$@" 2>&1)"; then
      log_step "$name" changed "$*"
      return 0
    fi
    local rc=$?
    log_step "$name" failed "$*"
    printf '%s\n' "$out"
    return "$rc"
  fi
  if "$@"; then
    log_step "$name" changed "$*"
    return 0
  fi
  log_step "$name" failed "$*"
  return 1
}

# Detect the platform once; the brief requires the script to say what it found.
detect_platform() {
  case "$(uname -s)" in
    Darwin) FAMILY=macos ;;
    Linux)  FAMILY=linux ;;
    *)      FAMILY=unknown ;;
  esac
  DISTRO=""
  if [ "$FAMILY" = linux ] && [ -r /etc/os-release ]; then
    DISTRO="$(. /etc/os-release && printf '%s' "${ID:-}")"
  fi
  WSL=0
  # WSL reports as Linux; the difference only matters for the install hint text.
  if [ "$FAMILY" = linux ] && [ -r /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
    WSL=1
  fi
}

# Guard: a deploy aimed at production needs both the flag and the env confirmation.
guard_prod() {
  [ "$TARGET" = prod ] || return 0
  if [ "$YES" != 1 ] || [ "$PROD_CONFIRM" != 1 ]; then
    log_step prod-guard failed "refused"
    fail_next "production requires --target prod --yes and WAFINE_PROD_CONFIRM=1" 2
  fi
  log_step prod-guard ok "confirmed"
}

# A target becomes part of ssh/compose commands; keep it to a safe shape.
valid_token() {
  case "$1" in
    ''|*[!A-Za-z0-9._@:/-]*) return 1 ;;
    *) return 0 ;;
  esac
}
