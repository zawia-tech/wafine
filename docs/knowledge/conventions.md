# Conventions

## Tooling
- Bun for the apps. OpenTofu through `scripts/tf <oci|aws|cloudflare> ...`, never bare `tofu`.
- Platform checks: `make check` (shell and tofu only). App checks: `cd app/bff && bun run typecheck && bun run lint && bun test`, `cd app/web && bun run typecheck && bun test`.
- On the VM, use the `stack/wa` wrapper for everything compose-related.

## Pull requests
- One task, one branch, one draft PR. Say the base branch in the body. Never stack on an unmerged branch without saying so.
- Verify claims before ticking them: PR number, base branch, CI result. If CI is down, say so and attach local results.
- Run a CodeRabbit review before merge. The owner merges.
- Never merge, deploy, run `tofu apply`, `supabase db push` or change DNS without the owner.

## Hard rules
- No hardcoded hosts or endpoints in code, config or examples. Use env vars, placeholders or localhost.
- Secrets never enter git, chat or logs. `stack/.env` lives only on the VM.
- Never edit the `OpenWA/` submodule. Layer config in `stack/`.
- Never run `drizzle-kit migrate` against the remote.
- Every container image must support linux/arm64.
- Public copy must match the code. Check pacing, encryption and revocation claims against the source before writing them.

## Release
Releases are published to the public repo as one reviewed snapshot commit per version, with no history. The maintainers run the export; contributors do not need to.
