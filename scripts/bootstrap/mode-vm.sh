#!/usr/bin/env bash
# vm mode: the first-deploy flow over ssh (docs/11-bootstrap.md) — ship the source, build and
# bring up the compose project on the host, then health-check the BFF on loopback.
# Parameterised by --target <ssh-host> (WAFINE_VM_HOST names the prod host).
# Sourced by bootstrap.sh.
# shellcheck disable=SC2034,SC2154

# Runs before prerequisites/config so a missing target is reported first.
precheck_vm() {
  [ -n "$TARGET" ] || fail_next "vm mode needs --target <ssh-host> (e.g. ubuntu@<your-vm>) — see docs/11-bootstrap.md"
}

# vm_ssh_target / vm_bare_host: resolve user@host and the bare host deploy.sh wants.
vm_resolve() {
  local host="$TARGET"
  if [ "$host" = prod ]; then
    host="${WAFINE_VM_HOST:-}"
    [ -n "$host" ] || fail_next "set WAFINE_VM_HOST to the production host, or pass --target <ssh-host>"
  fi
  valid_token "$host" || fail_next "target has unsupported characters: $host"
  VM_BARE="${host#*@}"
  VM_SSH_TARGET="$host"
  case "$host" in
    *@*) : ;;
    *)   VM_SSH_TARGET="${WAFINE_SSH_USER:-ubuntu}@$host" ;;
  esac
  VM_STACK_DIR="${WAFINE_STACK_DIR:-/opt/wa}"
  valid_token "$VM_STACK_DIR" || fail_next "WAFINE_STACK_DIR has unsupported characters"
}

mode_vm() {
  vm_resolve
  # prereq for the remote: reachable over ssh.
  step_run vm-ssh ssh -o BatchMode=yes "$VM_SSH_TARGET" true \
    || fail_next "ssh $VM_SSH_TARGET failed — check the host, your key and the tailnet"

  step_run vm-mkdir ssh -o BatchMode=yes "$VM_SSH_TARGET" "mkdir -p $VM_STACK_DIR/stack/certs" \
    || fail_next "could not create $VM_STACK_DIR/stack/certs on $VM_SSH_TARGET"

  # Ship + build + compose up + gateway-key check (stack/wa underneath).
  step_run vm-deploy "$ROOT/scripts/deploy.sh" "$VM_BARE" \
    || fail_next "deploy failed on $VM_SSH_TARGET — fix the error above and re-run vm"

  step_run vm-status ssh -o BatchMode=yes "$VM_SSH_TARGET" "cd $VM_STACK_DIR && ./stack/wa ps" || true

  step_run vm-health ssh -o BatchMode=yes "$VM_SSH_TARGET" "curl -fsS http://127.0.0.1:4000/health" \
    || fail_next "BFF health check failed on $VM_SSH_TARGET — check ./stack/wa ps and ./stack/wa logs bff on the VM"
}
