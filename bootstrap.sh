#!/usr/bin/env bash
# bootstrap.sh — WAFINE one-command setup for agents and humans.
#
#   ./bootstrap.sh [check|dev|vm|cloud] [flags]
#
# Flags: --agent (machine-readable STEP log), --dry-run, --yes, --target <name>.
# Modes and the --agent contract: docs/11-bootstrap.md.
# Idempotent; production targets need --target prod --yes and WAFINE_PROD_CONFIRM=1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROD_CONFIRM="${PROD_CONFIRM:-${WAFINE_PROD_CONFIRM:-}}"

# shellcheck source=scripts/bootstrap/lib.sh
. "$ROOT/scripts/bootstrap/lib.sh"
# shellcheck source=scripts/bootstrap/prereqs.sh
. "$ROOT/scripts/bootstrap/prereqs.sh"
# shellcheck source=scripts/bootstrap/config.sh
. "$ROOT/scripts/bootstrap/config.sh"
# shellcheck source=scripts/bootstrap/mode-check.sh
. "$ROOT/scripts/bootstrap/mode-check.sh"
# shellcheck source=scripts/bootstrap/mode-dev.sh
. "$ROOT/scripts/bootstrap/mode-dev.sh"
# shellcheck source=scripts/bootstrap/mode-vm.sh
. "$ROOT/scripts/bootstrap/mode-vm.sh"
# shellcheck source=scripts/bootstrap/mode-cloud.sh
. "$ROOT/scripts/bootstrap/mode-cloud.sh"

usage() {
  cat <<'EOF'
Usage: bootstrap.sh [mode] [flags]
modes: check (default), dev, vm, cloud
flags: --agent          machine-readable STEP log, NEXT-ACTION on failure
       --dry-run        print every command it would run, change nothing
       --yes            confirm non-interactive steps
       --target <name>  vm: ssh host; prod: production (needs WAFINE_PROD_CONFIRM=1)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    check|dev|vm|cloud) MODE="$1"; shift ;;
    --agent)   AGENT=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --yes)     YES=1; shift ;;
    --target)
      [ $# -ge 2 ] || fail_next "--target requires a name"
      TARGET="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail_next "unknown argument: $1 (see --help)" ;;
  esac
done

detect_platform
log_step OS ok "family=$FAMILY wsl=$WSL distro=${DISTRO:-unknown}"

guard_prod

# Mode-specific precondition (reported before prerequisites so the hint is precise).
case "$MODE" in
  vm) precheck_vm ;;
esac

prereqs_check
config_report

case "$MODE" in
  check) mode_check ;;
  dev)   mode_dev ;;
  vm)    mode_vm ;;
  cloud) mode_cloud ;;
esac

log_step bootstrap-done ok "mode=$MODE dry=$DRY yes=$YES target=${TARGET:-none}"
