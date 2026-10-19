---
name: wafine-deploy
description: Deploy or check a WAFINE stack with bootstrap.sh. Use when asked to deploy, bootstrap, set up dev, deploy to a VM, or run the stack check.
---

# WAFINE Deploy

Use this skill to deploy or validate a WAFINE environment using the repository bootstrap tooling.

## When to use
- Set up a local dev environment (`dev`)
- Deploy to a VM (`vm`) 
- Prepare cloud infrastructure (`cloud`)
- Just verify prerequisites (`check`)

## Prerequisites
- Git, Bun, Docker (for local dev)
- See `scripts/bootstrap.sh --check` for full list with install hints
- For prod: `WAFINE_PROD_CONFIRM=1` and `--target prod --yes` required

## Commands
```bash
# Check prerequisites (no changes)
./scripts/bootstrap.sh --check

# Interactive install of toolchain
./scripts/bootstrap.sh

# Agent mode - check only
./scripts/bootstrap.sh --agent --target check

# Agent mode - local dev
./scripts/bootstrap.sh --agent --target dev

# Agent mode - VM deploy
./scripts/bootstrap.sh --agent --target vm

# Agent mode - cloud (OCI + Cloudflare)
./scripts/bootstrap.sh --agent --target cloud
```

## Key details
- Idempotent; safe to re-run. Each step verifies or changes state.
- Secrets never printed; reads from env, `.env`, or `pass` paths per docs.
- Uses `scripts/tf` wrapper for OpenTofu (never run `tofu` bare).
- `--agent` gives machine-readable step logs and exits non-zero with next-action lines.

## References
- `scripts/bootstrap.sh` (modes, flags, prod guard)
- `scripts/tf`, `scripts/deploy.sh`, `docs/11-bootstrap.md`
