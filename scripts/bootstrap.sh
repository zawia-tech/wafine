#!/usr/bin/env bash
# Installs the operator toolchain (idempotent). macOS and Linux, one entry point.
#   scripts/bootstrap.sh          # install
#   scripts/bootstrap.sh --check  # report only, change nothing
#
# Platform differences live in scripts/lib/os.sh (probing) and in the two
# functions below (installing). WSL reports Linux and works; native Windows is
# not supported yet.
#
# WITH_TERRAFORM=1 also installs Terraform alongside OpenTofu (scripts/tf prefers
# tofu; set TF_BIN=terraform to use it).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/lib/os.sh"

CHECK=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[36m%s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
ver()  { "$1" --version 2>&1 | head -1; }

# report <cmd> <display> — used by both flows.
report() {
  local cmd="$1" label="${2:-$1}"
  if have "$cmd"; then
    printf '  ok      %-11s %s\n' "$label" "$(ver "$cmd")"
  else
    printf '  MISSING %-11s %s\n' "$label" "$(install_hint "$cmd")"
  fi
}

# ── macOS ──────────────────────────────────────────────────────────────────
bootstrap_macos() {
  have brew || { echo "✗ Homebrew is required: https://brew.sh" >&2; exit 1; }

  say "1. Toolchain (Homebrew)"
  local formulae=(oci-cli opentofu cloudflared uv jq)
  [ "${WITH_TERRAFORM:-0}" = 1 ] && formulae+=(terraform)
  local casks=(tailscale-app)

  if [ "$CHECK" = 1 ]; then
    for c in oci tofu cloudflared uv jq supabase tailscale; do report "$c"; done
    [ "${WITH_TERRAFORM:-0}" = 1 ] && report terraform
    return 0
  fi

  brew install "${formulae[@]}"
  brew install supabase/tap/supabase
  brew install --cask "${casks[@]}"

  say "2. Installed versions"
  for c in oci tofu cloudflared uv jq supabase; do report "$c"; done
}

# ── Linux ──────────────────────────────────────────────────────────────────
# Two paths, tried in order: the distro package manager, then a user-space
# installer for anything it doesn't package. Homebrew on Linux
# (https://docs.brew.sh/Homebrew-on-Linux) works too and is the fallback hint
# for unrecognised distros — but pacman/apt/dnf install system-wide, which is
# what tailscale and docker need.
bootstrap_linux() {
  # `yay` is preferred on Arch when present (AUR: supabase-bin, oci-cli).
  PKG=""
  case "$OS_DISTRO" in
    arch|omarchy|manjaro|endeavouros)
      if have yay; then PKG="yay -S --needed --noconfirm"; else PKG="sudo pacman -S --needed --noconfirm"; fi ;;
    debian|ubuntu|pop|linuxmint) PKG="sudo apt-get install -y" ;;
    fedora|rhel|centos)          PKG="sudo dnf install -y" ;;
    *)
      case "${OS_DISTRO_LIKE:-}" in
        *arch*)            PKG="sudo pacman -S --needed --noconfirm" ;;
        *debian*|*ubuntu*) PKG="sudo apt-get install -y" ;;
        *fedora*|*rhel*)   PKG="sudo dnf install -y" ;;
      esac ;;
  esac
  [ -n "$PKG" ] || echo "⚠ unrecognised distro '${OS_DISTRO:-unknown}' — user-space installers only"

  # install_pkg <cmd> <package>...  (skips anything already present)
  install_pkg() {
    local cmd="$1"; shift
    have "$cmd" && { printf '  ok      %-11s %s\n' "$cmd" "$(ver "$cmd")"; return 0; }
    [ "$CHECK" = 1 ] && { report "$cmd"; return 0; }
    [ -n "$PKG" ] || { echo "  skip    $cmd — $(install_hint "$cmd")"; return 0; }
    echo "  install $cmd via: $PKG $*"
    # shellcheck disable=SC2086
    $PKG "$@" || echo "  ⚠ failed for $cmd — try: $(install_hint "$cmd")"
  }

  # mise/uv fallback for tools most distro repos don't carry.
  install_mise() {
    local cmd="$1" formula="$2"
    have "$cmd" && { printf '  ok      %-11s %s\n' "$cmd" "$(ver "$cmd")"; return 0; }
    [ "$CHECK" = 1 ] && { report "$cmd"; return 0; }
    if have mise; then
      mise use -g "$formula" && printf '  ok      %-11s %s\n' "$cmd" "$(mise exec -- "$cmd" --version 2>&1 | head -1)"
    else
      echo "  skip    $cmd — install mise (https://mise.jdx.dev), then: mise use -g $formula"
      echo "          or: $(install_hint "$cmd")"
    fi
  }

  say "1. Base tooling"
  for p in curl jq git rsync age docker cloudflared tailscale; do install_pkg "$p" "$p"; done

  say "2. IaC"
  install_mise tofu opentofu@latest
  [ "${WITH_TERRAFORM:-0}" = 1 ] && install_mise terraform terraform@latest

  say "3. Supabase + Oracle CLIs"
  install_mise supabase supabase@latest
  have oci && { printf '  ok      %-11s %s\n' oci "$(ver oci)"; } || {
    if [ "$CHECK" = 1 ]; then report oci
    elif have uv; then uv tool install oci-cli && printf '  ok      %-11s %s\n' oci "$(ver oci)"
    else echo "  skip    oci — install uv (https://docs.astral.sh/uv), then: uv tool install oci-cli"
    fi
  }

  say "4. Platform notes"
  cat <<'EOF'
  · No `Icon\r` Finder artifacts here, so scripts/tf's TF_DATA_DIR workaround is a
    no-op (it still keeps .terraform/ out of the repo).
  · Docker: `sudo usermod -aG docker $USER`, then log out and back in.
  · Tailscale: `sudo systemctl enable --now tailscaled`, then `tailscale up`.
    One tailscaled serves ONE tailnet at a time; scripts/tailnet-sidecar runs a
    second, rootless, for a second tailnet.
  · The VM side (stack/, compose) is always Linux and unaffected.
EOF
}

# ── Dispatch ───────────────────────────────────────────────────────────────
case "$OS_FAMILY" in
  macos) bootstrap_macos ;;
  linux) bootstrap_linux ;;
  *) echo "✗ unsupported platform: $OS_KERNEL (WSL works; native Windows does not)" >&2; exit 1 ;;
esac

if [ "$CHECK" = 1 ]; then
  say "check-only run: nothing was installed"
  exit 0
fi

cat <<'EOF'

Next steps (interactive — your credentials, not automated on purpose):
  1. oci setup config      # ~/.oci/config + API key; upload the PUBLIC key in
                           # OCI Console > Profile > API keys
  2. tailscale up          # macOS: open the Tailscale app instead
  3. supabase login
  4. cloudflared tunnel login   # only for locally-managed tunnels; token mode doesn't need it
EOF
