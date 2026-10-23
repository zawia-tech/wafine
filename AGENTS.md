# WaFine: notes for coding agents

WaFine is an open-core WhatsApp gateway built on OpenWA. This repo holds the BFF (`app/bff`, Bun + Hono), the web app (`app/web`, Next.js), the docs site (`app/docs`, Fumadocs), the VM compose stack (`stack/`) and the infrastructure code (`terraform/`, OpenTofu). The engine is the upstream submodule `OpenWA/`, pinned to v0.24.0.

## Start here
- `README.md`, `CONTRIBUTING.md`, `docs/00-setup.md`, `docs/02-architecture.md`.
- Set up: `git submodule update --init OpenWA`, then `./bootstrap.sh` (`docs/11-bootstrap.md`).
- Before a PR: `make check`; in `app/bff`: `bun run typecheck && bun run lint && bun run test`; in `app/web`: `bun run typecheck && bun run test`.

## Rules
- Branch with `scripts/flow start feature|fix|support <slug>` from `develop` and open the PR into `develop`; never commit on `main` or `develop`. Run `make hooks` once (`docs/git-flow.md`). Commit subjects are `type(scope): summary`.
- Never edit `OpenWA/`. Configure the engine through `stack/`. Upstream compose forwards an explicit list of env vars: check `OpenWA/docker-compose.yml` before adding one to `stack/.env.example`.
- OpenWA is not `open-wa/wa-automate`. Port 2785, header `X-API-Key`, events such as `message.received`. Read `OpenWA/README.md` and `OpenWA/docs/` instead of guessing.
- No secrets in git, issues, PRs or logs: `stack/.env`, `*.tfvars`, API keys, tokens, passwords, QR codes, WhatsApp session data.
- Run IaC only through `scripts/tf <oci|aws|cloudflare> …`. `plan` is fine; `apply` and `destroy` need a maintainer's yes.
- Schema changes go in a new file in `supabase/migrations/`. Never edit an applied migration.
- Container images must support linux/arm64. Never publish a container port on 0.0.0.0: only the BFF is public, through the tunnel.
- WhatsApp: test with a dedicated number, keep send pacing on, no bulk or cold sends.

## Ask a maintainer first
Anything billed, DNS changes, `tofu apply` or `destroy`, `supabase db push`, deleting a WhatsApp session or the engine data volume.
