#!/usr/bin/env bash
# Shared OS/platform helpers. Source it, don't execute it:
#   . "$(dirname "${BASH_SOURCE[0]}")/lib/os.sh"
#
# This repo is used from macOS (Homebrew, BSD userland) and from Linux (pacman/apt,
# GNU coreutils). The differences that bite are: `date` flags, `sed -i`, `seq`,
# `stat`, and where the toolchain lives. Keep every such difference in here.
#
# Never assume GNU *or* BSD: probe once, then call the wrapper.
#
# This file is a *library*: several variables below are consumed by the scripts
# that source it, so shellcheck's "appears unused" does not apply.
# shellcheck disable=SC2034

# ── Platform detection ──────────────────────────────────────────────────────
OS_KERNEL="$(uname -s)"          # Darwin | Linux
OS_ARCH="$(uname -m)"            # arm64 | aarch64 | x86_64
case "$OS_KERNEL" in
  Darwin) OS_FAMILY=macos ;;
  Linux)  OS_FAMILY=linux ;;
  *)      OS_FAMILY=unknown ;;
esac

# Which Linux distro family, for package hints. Empty on macOS.
OS_DISTRO=""
if [ "$OS_FAMILY" = linux ] && [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  OS_DISTRO="$(. /etc/os-release && printf '%s' "${ID:-}")"
  OS_DISTRO_LIKE="$(. /etc/os-release && printf '%s' "${ID_LIKE:-}")"
fi

# ── Portable `date -u` ──────────────────────────────────────────────────────
# BSD:  date -u -v-2H +FMT      GNU:  date -u -d '-2 hours' +FMT
# Prints the timestamp, or NOTHING and returns 1. Callers MUST handle the
# failure: a silently empty timestamp is how the observer cursor broke.
date_ago() {
  # date_ago <amount> <unit> <format>   e.g. date_ago 2 HOURS +%Y-%m-%dT%H:%M:%SZ
  local n="$1" unit="$2" fmt="$3" out
  case "$OS_FAMILY" in
    macos) out="$(date -u -v-"$n"${unit:0:1} "$fmt" 2>/dev/null)" || return 1 ;;
    *)     out="$(date -u -d "-$n $unit" "$fmt" 2>/dev/null)" || return 1 ;;
  esac
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

# ── Portable in-place sed ──────────────────────────────────────────────────
# BSD sed needs `-i ''`, GNU sed rejects the empty argument. Use this instead
# of writing `sed -i` anywhere in the repo.
sed_inplace() {
  # sed_inplace <script> <file> [sed args...]
  local script="$1" file="$2"; shift 2
  case "$OS_FAMILY" in
    macos) sed -i '' "$@" -e "$script" "$file" ;;
    *)     sed -i "$@" -e "$script" "$file" ;;
  esac
}

# ── Misc portability ───────────────────────────────────────────────────────
# `seq` is not in POSIX and is absent from some minimal BSD/container images.
# Prefer brace expansion; use this only where a loop bound is a variable.
int_range() {
  # int_range <n> -> prints 1..n
  local n="$1" i
  for ((i = 1; i <= n; i++)); do printf '%s\n' "$i"; done
}

# `readlink -f` is GNU-only; BSD readlink lacks it. Falls back to a pure-shell
# resolution so scripts can be sourced from a symlinked shim.
abs_path() {
  local p="$1" d
  if command -v realpath >/dev/null 2>&1; then
    realpath "$p"
  elif [ "$OS_FAMILY" = macos ] && command -v greadlink >/dev/null 2>&1; then
    greadlink -f "$p"
  else
    d="$(cd "$(dirname "$p")" && pwd)"; printf '%s/%s\n' "$d" "$(basename "$p")"
  fi
}

# ── Requirements ───────────────────────────────────────────────────────────
# Prints the install hint for the current platform. Keep this list in sync with
# scripts/bootstrap.sh.
install_hint() {
  # install_hint <tool>
  local tool="$1"
  case "$OS_FAMILY" in
    macos)
      case "$tool" in
        tofu)        echo "brew install opentofu" ;;
        supabase)    echo "brew install supabase/tap/supabase" ;;
        oci)         echo "brew install oci-cli" ;;
        tailscale)   echo "brew install --cask tailscale-app" ;;
        *)           echo "brew install $tool" ;;
      esac ;;
    linux)
      case "$OS_DISTRO" in
        arch|omarchy)
          case "$tool" in
            tofu)      echo "sudo pacman -S opentofu   # or: yay -S opentofu-bin" ;;
            supabase)  echo "yay -S supabase-bin       # or: mise use -g supabase@latest" ;;
            oci)       echo "yay -S oci-cli            # or: uv tool install oci-cli" ;;
            tailscale) echo "sudo pacman -S tailscale" ;;
            *)         echo "sudo pacman -S $tool" ;;
          esac ;;
        debian|ubuntu)
          case "$tool" in
            tofu)      echo "snap install opentofu --classic   # or: apt install tofu" ;;
            supabase)  echo "mise use -g supabase@latest" ;;
            oci)       echo "uv tool install oci-cli" ;;
            tailscale) echo "curl -fsSL https://tailscale.com/install.sh | sh" ;;
            *)         echo "apt install $tool" ;;
          esac ;;
        *)
          echo "no package hint for distro '${OS_DISTRO:-unknown}' — try Homebrew on Linux: https://docs.brew.sh/Homebrew-on-Linux" ;;
      esac ;;
    *) echo "unsupported platform: $OS_KERNEL" ;;
  esac
}

# require_cmd <tool>... — exit with a platform-correct hint when one is missing.
require_cmd() {
  local missing=0 tool
  for tool in "$@"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "missing: $tool — install with: $(install_hint "$tool")" >&2
      missing=1
    fi
  done
  [ "$missing" = 0 ] || return 1
}

# ── IaC binary ─────────────────────────────────────────────────────────────
# scripts/tf runs OpenTofu (lock files are committed for it). Set TF_BIN to
# override, e.g. TF_BIN=terraform for a Terraform-only workstation.
tf_bin() {
  if [ -n "${TF_BIN:-}" ]; then
    command -v "$TF_BIN" >/dev/null 2>&1 || { echo "TF_BIN=$TF_BIN not found" >&2; return 1; }
    printf '%s\n' "$TF_BIN"
    return 0
  fi
  local c
  for c in tofu terraform; do
    if command -v "$c" >/dev/null 2>&1; then printf '%s\n' "$c"; return 0; fi
  done
  echo "neither tofu nor terraform found — install with: $(install_hint tofu)" >&2
  return 1
}
