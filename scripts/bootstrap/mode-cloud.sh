#!/usr/bin/env bash
# cloud mode: tofu init+plan for every terraform module present. Never applies —
# the apply command is only ever printed as a next action for a human to review.
# Sourced by bootstrap.sh.
# shellcheck disable=SC2034,SC2154

mode_cloud() {
  local dir name rc=0 tf="$ROOT/scripts/tf"
  [ -x "$tf" ] || fail_next "scripts/tf not found or not executable"

  local mods=()
  for dir in "$ROOT"/terraform/*/; do
    [ -d "$dir" ] || continue
    mods+=("$(basename "$dir")")
  done
  [ "${#mods[@]}" -gt 0 ] || fail_next "no terraform modules found under terraform/"

  for name in "${mods[@]}"; do
    step_run "tf-init-$name" "$tf" "$name" init -input=false || { rc=1; continue; }
    step_run "tf-plan-$name" "$tf" "$name" plan -input=false || rc=1
  done

  if [ "$rc" -eq 0 ]; then
    log_step cloud-plan ok "tofu plan only (never applied)"
    printf 'NEXT-ACTION: review the plans above, then apply deliberately per module: scripts/tf <module> apply\n'
  else
    fail_next "one or more tofu plans failed — provide terraform/<module>/terraform.tfvars, then re-run cloud"
  fi
}
