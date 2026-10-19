# 11. Bootstrap: one-command bring-up

This document describes `bootstrap.sh` (Unix, macOS, WSL) and `bootstrap.ps1` (Windows) to get a fresh clone ready for dev, VM deploy or cloud plan.

## Modes

Each mode reports `NEXT-ACTION: <hint>` and exits non-zero if a step fails; nothing is applied in `cloud`.

- `check` (default): verify prerequisites and run `scripts/stack-check`; a stack-check failure fails the mode.
- `dev`: install the Bun apps (`app/web`, `app/bff`, `app/docs`) with `bun install --frozen-lockfile`, create `stack/.env` from `stack/.env.example` only if absent, bring up the local stack (`make local-up`), then assert the wiring with `scripts/stack-check`.
- `vm`: the first deploy over ssh — needs `--target <ssh-host>`; makes the remote dirs, ships the source (`scripts/deploy.sh`), `stack/wa ps`, then health-checks the BFF on loopback.
- `cloud`: `tofu init` + `tofu plan` for every module under `terraform/`; never applies (the apply command is only printed as a next action).

## Flags

- `--agent`: non-interactive, machine-readable output (one line per step, exit non-zero with a `NEXT-ACTION:` line on failure).
- `--dry-run`: print planned actions without performing side effects.
- `--yes`: confirm non-destructive steps.
- `--target <name>`: `vm` needs an ssh host (e.g. `ubuntu@<your-vm>`); `prod` is the production target.

## Prerequisites

Required: `git`, `bun`, `docker` + `docker compose`, `tofu`, `gh`, `supabase`, `vercel`.
Optional: `pass`, `tailscale` (warnings only, skipped if missing).

Platform-specific install hints are provided when missing.

## CONFIG keys

CONFIG keys are read from (in order): environment variables, `stack/.env`, `.env`, or the documented `pass` paths (e.g. `OPENWA_API_KEY` → `accounts/openwa/wafine/api-key`). Values are never printed; only the source that satisfied each key is reported (`env`, `.env`, `pass`) or `missing`.

Required keys per mode: `vm` needs `PUBLIC_API_URL`, `WEB_URL`, `OPENWA_API_KEY`; `cloud` needs `SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`. `check` and `dev` require none (dev falls back to localhost defaults). A missing required key fails `dev`/`vm`/`cloud` with a `NEXT-ACTION:`; in `check` it is a warning.

`BFF_PORT` (default 4000) and `WEB_PORT` (default 3000) are dev defaults, not secrets, so they are reported as `default=<n>`.

## Real `check --agent` output

From this repo (OpenWA submodule not yet initialised, so `stack-check` fails with a next action — expected on a fresh clone):

```text
STEP OS ok family=linux wsl=0 distro=omarchy
STEP prereqs ok starting
STEP prereq-git ok found
STEP prereq-bun ok found
STEP prereq-tofu ok found
STEP prereq-gh ok found
STEP prereq-supabase ok found
STEP prereq-vercel ok found
STEP prereq-docker ok docker + compose found
STEP prereq-pass ok found
STEP prereq-tailscale ok found
STEP CONFIG:SITE_URL skipped missing (not required in check)
STEP CONFIG:NEXT_PUBLIC_API_URL skipped missing (not required in check)
STEP CONFIG:NEXT_PUBLIC_DOCS_URL skipped missing (not required in check)
STEP CONFIG:PUBLIC_API_URL skipped missing (not required in check)
STEP CONFIG:WEB_URL skipped missing (not required in check)
STEP CONFIG:OPENWA_API_KEY ok pass
STEP CONFIG:BFF_PORT ok default=4000
STEP CONFIG:WEB_PORT ok default=3000
STEP stack-check failed scripts/stack-check failed
NEXT-ACTION: fix the stack (often: git submodule update --init --depth 1 OpenWA) then re-run check
```

## Real `dev --agent --dry-run` output

```text
STEP OS ok family=linux wsl=0 distro=omarchy
STEP prereqs ok starting
STEP prereq-git ok found
STEP prereq-bun ok found
STEP prereq-tofu ok found
STEP prereq-gh ok found
STEP prereq-supabase ok found
STEP prereq-vercel ok found
STEP prereq-docker ok docker + compose found
STEP prereq-pass ok found
STEP prereq-tailscale ok found
STEP CONFIG:SITE_URL skipped missing (not required in dev)
STEP CONFIG:NEXT_PUBLIC_API_URL skipped missing (not required in dev)
STEP CONFIG:NEXT_PUBLIC_DOCS_URL skipped missing (not required in dev)
STEP CONFIG:PUBLIC_API_URL skipped missing (not required in dev)
STEP CONFIG:WEB_URL skipped missing (not required in dev)
STEP CONFIG:OPENWA_API_KEY ok pass
STEP CONFIG:BFF_PORT ok default=4000
STEP CONFIG:WEB_PORT ok default=3000
STEP bun-install ok would run bun install --frozen-lockfile (app/web)
STEP bun-install ok would run bun install --frozen-lockfile (app/bff)
STEP bun-install ok would run bun install --frozen-lockfile (app/docs)
STEP stack-env ok would create stack/.env from stack/.env.example
STEP local-stack ok would run: make local-up
STEP stack-check ok would run: scripts/stack-check
STEP bootstrap-done ok mode=dev dry=1 yes=0 target=none
```

On failure, the script prints `NEXT-ACTION: <hint>` and exits non-zero.

## Production guard

Production targets (`--target prod`) require both `--yes` and `WAFINE_PROD_CONFIRM=1`. Without them the script prints a `NEXT-ACTION:` and exits with status **2**.

## Windows path

`bootstrap.ps1` detects WSL or Git Bash and re-executes `bootstrap.sh` with the same arguments. If neither is present, it provides an install hint.

## Agent prompt (README single prompt)

```
Paste into Claude Code or OpenCode from a fresh clone: Read CONTRIBUTING.md and docs/11-bootstrap.md, then run `./bootstrap.sh dev --agent` and follow each `NEXT-ACTION:` line until the stack check passes. Report what you deployed and the URLs.
```
