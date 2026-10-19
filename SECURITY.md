# Security Policy

## Private reporting
Report suspected security vulnerabilities via [GitHub Security Advisories](https://github.com/zawia-tech/wafine/security/advisories/new).

Do not open public GitHub issues for security problems. Include a concise description, reproduction steps (if any), affected components (OCI VM/OpenWA/BFF/web, Terraform, Supabase, Cloudflare/Tailscale), and any relevant logs (redacted). 

## Supported versions
Only the `main` branch and the most recently published release tag are actively supported. Older commits may receive fixes at maintainers' discretion.

## Scope
This project deploys a self-hosted OpenWA gateway (OCI Ampere A1, Tailscale, Cloudflare Tunnel+Access, Supabase). In-scope: infra code (Terraform/compose), Bun apps (`app/bff`, `app/web`, `app/docs`), deployment scripts. Out of scope: upstream `OpenWA/` submodule (report to its maintainer), third-party services (OCI, Cloudflare, Supabase, Tailscale), client WhatsApp accounts, or end-user devices.

## Secrets & disclosure
Never share secrets (.env, *.tfvars, API keys, tunnel tokens, QR codes, phone numbers, session state). Respect WhatsApp's Terms of Service and local laws (including Morocco Law 09-08 on international data transfers). Maintainers will coordinate disclosure timelines with reporters.
