# Release process

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): `MAJOR.MINOR.PATCH`.

## Versioning rules
- `MAJOR`: incompatible API/infra changes, security model changes, or breaking Cloudflare/Tunnel/Supabase schema that requires manual migration.
- `MINOR`: backwards-compatible new features (apps, scripts, docs, terraform modules) that don't require destructive actions.
- `PATCH`: backwards-compatible bugfixes, dependency/security patches, or doc fixes.

## Wafine launch
Tag **v1.0.0** for the Wafine launch. Update [CHANGELOG.md](../CHANGELOG.md) under `[Unreleased]` → release notes, then create a Git tag and GitHub release.

## Release steps
1. Ensure `main` is green (CI: shell.yml, app.yml, nightly-health if applicable). Review open PRs and merge only after human approval.
2. Update `CHANGELOG.md`: move `[Unreleased]` entries to a new section `[1.0.0] - YYYY-MM-DD` (or chosen version/date), and keep an empty `[Unreleased]` header.
3. Commit: `git commit -am "chore(release): prepare v<version>"`
4. Tag: `git tag -a v<version> -m "Release v<version>"` (signed if configured).
5. Push: `git push origin main && git push origin v<version>`.
6. Create a GitHub release from the tag, pasting the changelog section and any deployment notes (redact secrets).
7. Verify release artifacts/checks; if a hotfix is needed, bump `PATCH` and repeat.

Notes:
- **Never** commit secrets (.env, *.tfvars, keys, tokens, QR codes, phone numbers). 
- The `OpenWA/` submodule must remain pinned intentionally; if bumping it, document in changelog and re-check env vars against the new `OpenWA/docker-compose.yml`.
- Deployed infra changes still require explicit approval (the owner approves each apply). Releases don't auto-apply Terraform.
- [Launch checklist](15-launch-checklist.md) — ordered steps for 2026-10-20 go-live.
