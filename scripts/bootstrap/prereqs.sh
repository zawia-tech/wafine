#!/usr/bin/env bash
# Prerequisite checks + platform-specific install hints.
# Sourced by bootstrap.sh; reads FAMILY, DISTRO, AGENT from lib.sh.
# shellcheck disable=SC2034

# install hint for the current platform (family: macos|linux|unknown)
os_hint_install() {
  local tool="$1"
  case "$FAMILY" in
    macos)
      case "$tool" in
        tofu)      echo "brew install opentofu" ;;
        supabase)  echo "brew install supabase/tap/supabase" ;;
        docker)    echo "brew install --cask docker" ;;
        bun)       echo "curl -fsSL https://bun.sh/install | bash" ;;
        vercel)    echo "npm install -g vercel || bun add -g vercel" ;;
        pass)      echo "brew install pass" ;;
        tailscale) echo "brew install --cask tailscale-app" ;;
        *)         echo "brew install $tool" ;;
      esac ;;
    linux)
      case "$DISTRO" in
        arch|omarchy)
          case "$tool" in
            tofu)      echo "sudo pacman -S opentofu" ;;
            docker)    echo "sudo pacman -S docker docker-compose && sudo systemctl enable --now docker" ;;
            bun)       echo "curl -fsSL https://bun.sh/install | bash" ;;
            vercel)    echo "npm install -g vercel || bun add -g vercel" ;;
            pass)      echo "sudo pacman -S pass" ;;
            tailscale) echo "sudo pacman -S tailscale && sudo systemctl enable --now tailscaled" ;;
            *)         echo "sudo pacman -S $tool" ;;
          esac ;;
        debian|ubuntu)
          case "$tool" in
            tofu)      echo "snap install opentofu --classic" ;;
            docker)    echo "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER" ;;
            bun)       echo "curl -fsSL https://bun.sh/install | bash" ;;
            vercel)    echo "npm install -g vercel || bun add -g vercel" ;;
            pass)      echo "sudo apt install pass" ;;
            tailscale) echo "curl -fsSL https://tailscale.com/install.sh | sh" ;;
            *)         echo "sudo apt install $tool" ;;
          esac ;;
        *)
          case "$tool" in
            docker)    echo "https://docs.docker.com/engine/install/" ;;
            bun)       echo "https://bun.sh/install" ;;
            tofu)      echo "https://opentofu.org/docs/intro/install/" ;;
            vercel)    echo "npm install -g vercel || bun add -g vercel" ;;
            pass)      echo "https://www.passwordstore.org/#download" ;;
            tailscale) echo "https://tailscale.com/download/linux" ;;
            *)         echo "install $tool" ;;
          esac ;;
      esac ;;
    *)
      echo "install $tool" ;;
  esac
}

# prereqs_check: report every required tool, then fail once with a next action.
# Missing optional tools are warnings (skipped), never failures.
prereqs_check() {
  local fail=0 req opt
  log_step prereqs ok "starting"
  for req in git bun tofu gh supabase vercel; do
    if tool_ok "$req"; then
      log_step "prereq-$req" ok "found"
    else
      log_step "prereq-$req" failed "missing — $(os_hint_install "$req")"
      fail=1
    fi
  done

  if tool_ok docker && { tool_ok docker-compose || docker compose version >/dev/null 2>&1; }; then
    log_step prereq-docker ok "docker + compose found"
  else
    log_step prereq-docker failed "docker/compose missing — $(os_hint_install docker)"
    fail=1
  fi

  for opt in pass tailscale; do
    if tool_ok "$opt"; then
      log_step "prereq-$opt" ok "found"
    else
      log_step "prereq-$opt" skipped "optional — $(os_hint_install "$opt")"
    fi
  done

  if [ "$fail" = 1 ]; then
    fail_next "install the missing prerequisites (hints above), then re-run"
  fi
}
