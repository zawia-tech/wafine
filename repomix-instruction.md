# WAFINE context pack — how to read this

**WAFINE** is an open-core WhatsApp gateway built on the **OpenWA** engine
(`rmyndharis/OpenWA`, an upstream submodule — never edit it). It runs on a
single OCI Ampere A1 VM in Casablanca (`af-casablanca-1`), fronted by Cloudflare
Tunnel + Access, backed by Supabase Postgres, with a Hono BFF (`app/bff`, on the
VM beside the engine) and a Next.js web app (`app/web`, on Vercel).

## Rule 1 — never hardcode hosts

Production hostnames (the `web.`, `api.` and `docs.` subdomains of the production zone) and the testing
playground zone live in the operator vault and in environment variables, **not
in code**. If you are about to write a hostname, a zone, an account id or a
tunnel id into a file, stop: read it from config (`lib/site.ts`, env vars,
`terraform/*/terraform.tfvars`, `stack/.env`) instead. Secrets never appear in
repo files — `stack/.env` and `*.tfvars` are workstation/VM only, and the pack
does not contain them.

## Rule 2 — where to look first

| Question | Read |
|---|---|
| What the product is, what changed | `README.md`, then the other root `*.md` files |
| Repo rules, commands, hard constraints | `CONTRIBUTING.md`, the root agent instruction files, `Makefile` |
| Deploy / operate / DNS | `docs/11-bootstrap.md`, `docs/02-architecture.md`, `scripts/deploy.sh` |
| Architecture and rationale | `docs/02-architecture.md` |
| BFF API surface and behaviour | `app/bff/src/` |
| Web app, auth, i18n | `app/web/src/` |
| Infra as code | `terraform/{oci,cloudflare,aws}/` |
| Compose stack and secrets tooling | `stack/` |
| Schema changes | `supabase/migrations/` (new file per change) |

## Rule 3 — trust the source over this summary

This pack is compressed: function bodies are reduced to signatures and comments
and blank lines are stripped. For a change you intend to make, read the real
file. Compression is for orientation and architecture questions.

## Limits

No secrets, no `OpenWA/` vendored source, no lockfiles, no tests/fixtures, no
build output, no generated migration snapshots, no operator research notes or
review transcripts. If something you need is missing, it is deliberately out of
scope — read it from the repo.
