# Launch checklist (2026-10-20)

For the plan B launch (web and docs on the production hosts, API on the playground API host), follow the ordered runbook [go-live-2026-10-20.md](go-live-2026-10-20.md).
After launch, development moves to a fresh single-commit repo in the zawia-tech organization.


Use this checklist for the WAFINE launch (v1.0.0). Every step must be verified before proceeding to the next. All hostnames use placeholders (`example.com`, `<your-domain>`); no secrets.

**Automated spot-check:** `scripts/launch-check.sh` runs a read-only subset of the checks below (DNS, mail MX/SPF/DMARC/DKIM, API TLS and CNAME, HTTP 200/404, Vercel env, GitHub secrets, Supabase migration). With `--agent` it emits the same `STEP <name> <ok|failed|skipped> <detail>` line format as `bootstrap.sh`, so one parser reads both; on any required failure it exits non-zero and prints a final `NEXT-ACTION:` line. Targets may be bare hosts or full URLs.

```bash
scripts/launch-check.sh --agent \
  --target app.example.com --api api.example.com --docs docs.example.com \
  --mail-domain example.com --dkim-selectors google,selector1
```

`--mail-domain` and `--dkim-selectors` are optional; without them the mail steps are reported as `skipped`.

## (a) Decisions still open

- [ ] **DNS option for the API host.** Both options keep the zone at the current registrar and open **no** inbound ports on the VM until you deliberately choose otherwise; web and docs are CNAMEs to Vercel under either.
  - **Option A — Cloudflare for SaaS custom hostname (default, no open ports).** The API hostnames live wherever the DNS holder keeps them, and are declared as *custom hostnames* on the WAFINE Cloudflare zone. Cloudflare terminates TLS for each exact hostname and routes it through the existing tunnel to the BFF (`terraform/cloudflare` creates the `cloudflare_custom_hostname` resources, the fallback origin, and one tunnel ingress rule per hostname — nothing is applied unless the owner runs `scripts/tf cloudflare apply`). Enable it by filling `custom_hostnames` in `terraform/cloudflare/terraform.tfvars`.
  - **Option B — registrar DNS + Caddy on the VM (needs captain approval).** Point the API host's `A` record at the VM and set `CADDY_API_HOST` in `stack/.env`, which enables the `caddy` compose profile. This **re-opens inbound ports 80 and 443** on the VM — the one documented exception to the zero-inbound-port rule — so it needs the captain's explicit approval before use.
- [ ] **Cloudflare account.** Confirm which Cloudflare account and zone carries the tunnel and the custom hostnames (option A). Real accounts live in the operator vault.
- [ ] **Who runs the cutover.** Assign an owner (Youssef/moughamir) and on-call for the launch window.

## (b) Vercel project `web` env vars

Set these on the `web` project in production. Use the exact commands from Vercel CLI.

| Env var | Value (placeholder) | Command (verify the variable names) |
|---|---|---|
| `SITE_URL` | `https://app.example.com` | `vercel env add SITE_URL production` |
| `NEXT_PUBLIC_API_URL` | `https://api.example.com` | `vercel env add NEXT_PUBLIC_API_URL production` |
| `NEXT_PUBLIC_DOCS_URL` | `https://docs.example.com` | `vercel env add NEXT_PUBLIC_DOCS_URL production` |
| `CONTACT_EMAIL` | `hello@example.com` | `vercel env add CONTACT_EMAIL production` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `hello@example.com` | `vercel env add NEXT_PUBLIC_CONTACT_EMAIL production` |
| `BFF_URL` | `https://api.example.com` | `vercel env add BFF_URL production` |

**Verify with:**
```bash
vercel env ls production
```
All six names must be present. Redeploy the web app after setting env vars.

## (c) VM stack `.env` lines

On the VM (in `/opt/wa/stack/.env`), ensure these lines are set and match the final hosts.

```env
WEB_URL=https://app.example.com
PUBLIC_API_URL=https://api.example.com
```

**Apply via runbook flow:**
- Edit `/opt/wa/stack/.env` on the VM.
- Run `./stack/wa up -d` (or `scripts/deploy.sh` as appropriate) to restart services that need the new values.
- For the BFF, confirm it reads the new values.

**Verify with:**
```bash
ssh <vm-host> 'grep -E "^(WEB_URL|PUBLIC_API_URL)=" /opt/wa/stack/.env'
ssh <vm-host> 'curl -s http://127.0.0.1:4000/health/ready'
```
`/health/ready` must return 200.

## (d) DNS records for web, api, docs

Do this according to the chosen option in (a). Neither option moves the zone's nameservers.

**Option A (Cloudflare for SaaS custom hostname — default, no open ports)**

| Host | Type | Value | Where to create it |
|---|---|---|---|
| `app.example.com` (web) | CNAME | Vercel-provided target (DNS-only) | registrar |
| `docs.example.com` (docs) | CNAME | Vercel-provided target (DNS-only) | registrar |
| `api.example.com` (BFF, custom hostname) | CNAME | CNAME target from `custom_hostname_dns` output | at the DNS holder of the custom hostname |

How to enable it (owner only; nothing here runs automatically):

1. In `terraform/cloudflare/terraform.tfvars`, set `custom_hostnames = ["api.example.com"]` (placeholders in the repo, the real hostname in the real tfvars).
2. `scripts/tf cloudflare plan` — the plan adds one `cloudflare_custom_hostname` per entry, a proxied fallback-origin record, the `cloudflare_custom_hostname_fallback_origin`, and one tunnel ingress rule per hostname (before the catch-all `http_status:404`).
3. Owner applies it, then runs `scripts/tf cloudflare output -json custom_hostname_dns`. For each hostname it contains:
   - `ownership_txt` — TXT name/value the DNS holder must publish once to prove ownership,
   - `ssl_validation_records` — the SSL validation records for certificate issuance,
   - `cname` — the CNAME target the DNS holder publishes for the API host itself.

   Hand those records to whoever holds the custom hostname's DNS; they are the only records that party needs to create.
4. `scripts/launch-check.sh --api <api-host>` confirms the CNAME exists and TLS matches the exact name.

**Option B (registrar DNS + Caddy on the VM — needs captain approval, re-opens inbound 80/443)**

| Host | Type | Value | Where to create it |
|---|---|---|---|
| `app.example.com` (web) | CNAME | Vercel-provided target (DNS-only) | registrar |
| `docs.example.com` (docs) | CNAME | Vercel-provided target (DNS-only) | registrar |
| `api.example.com` (BFF) | A | VM public IP | registrar |

1. Set `CADDY_API_HOST=api.example.com` in `stack/.env` (empty by default: the `caddy` profile stays off). `./stack/wa up -d` then also starts `openwa-caddy`, which terminates TLS for that one hostname and proxies to the BFF. Published ports 80/443 are the deliberate exception documented in `stack/compose.infra.yml` — captain approval required.
2. Point the API host's `A` record at the VM and wait for Let's Encrypt to issue the certificate on first start.
3. `scripts/launch-check.sh --api <api-host>` confirms TLS and `/health`.

**Verify with:**
```bash
dig +short app.example.com
dig +short api.example.com
dig +short docs.example.com
scripts/launch-check.sh --agent \
  --target app.example.com --api api.example.com --docs docs.example.com \
  --mail-domain example.com --dkim-selectors google,selector1
```
Each `dig` must return at least one record, and the launch-check STEP lines for `dns-web`, `dns-api`, `dns-docs`, `api-cname`, `api-tls` and `api-health` must be `ok`. The mail steps (`mail-mx`, `mail-spf`, `mail-dmarc`, `mail-dkim`) must also be `ok` when `--mail-domain`/`--dkim-selectors` are passed: they confirm the zone's mail records still resolve after the cutover. For web/api, also verify HTTP from outside:
```bash
curl -sI https://app.example.com/
curl -s https://api.example.com/health
```
`app.example.com/` returns 200; `api.example.com/health` returns 200.

## (e) Supabase

- [ ] **Dry run the waitlist migration.** `supabase db push --dry-run`
  **Verify with:** the command prints what would be applied without errors.
- [ ] **Apply the waitlist migration.** `supabase db push`
  **Verify with:** `supabase migration list --linked` shows `20261017120000_waitlist.sql` applied.
- [ ] **Set Auth Site URL.** In Supabase Auth settings, set Site URL to `https://app.example.com` and add redirect allowlist entries as needed.
  **Verify with:** a sign-up/login flow reaches `https://app.example.com` correctly.

## (f) GitHub secrets for the e2e job

The `e2e` job in `.github/workflows/app.yml` (PRs) and the matching `e2e` job in
`.github/workflows/nightly-health.yml` (schedule) run the J1–J6 journey from
`app/web/e2e/journey.e2e.ts`. They expect:

| Name | Kind | Used for |
|---|---|---|
| `E2E_EMAIL` | secret | invited test account (login, J2–J5) |
| `E2E_PASSWORD` | secret | invited test account (login, J2–J5) |
| `E2E_WA_NUMBER` | secret | E.164 WhatsApp number of the test account |
| `E2E_MCP_URL` | secret | public MCP endpoint (J6 OAuth discovery) |
| `E2E_BASE_URL` | variable | deployment under test; the nightly uses it directly, the PR job falls back to the Vercel preview URL for the branch |

Until they are configured, both jobs print `skipped: no E2E secrets` and every test
reports skipped (exit 0) — a green run without coverage, never a red one.

**Verify with:**
```bash
gh secret list
gh variable list
```
The four secrets and the `E2E_BASE_URL` variable must be present per the table.

## (g) OG validation

Validate OpenGraph and basic SEO endpoints.

- [ ] **Validator 1:** use an online OG validator to check `https://app.example.com/` and `https://app.example.com/opengraph-image`.
- [ ] **Validator 2:** use another online OG validator (or curl to inspect tags) to confirm `og:title`, `og:description`, `og:image` are correct.

**Verify with:**
```bash
curl -sI https://app.example.com/
curl -sI https://app.example.com/opengraph-image
curl -sI https://app.example.com/robots.txt
curl -sI https://app.example.com/humans.txt
curl -sI https://app.example.com/llms.txt
```

## (h) J1 to J7 dry run

Use the `wafine-onboard` skill to walk through the full onboarding journey (J1–J7) against the production target.

**Verify with:**
- Complete J1–J7 successfully end-to-end (invite-only sign-up, connect WhatsApp number, build a workflow, mint API key, test API, connect Claude if applicable).
- All steps pass without errors.

## (i) Tag v1.0.0 per docs/release.md

Follow the release process in [docs/release.md](release.md).

**Steps:**
1. Ensure `main` is green (CI passes).
2. Update `CHANGELOG.md` → move `[Unreleased]` to `[1.0.0] - YYYY-MM-DD`, keep empty `[Unreleased]`.
3. `git commit -am "chore(release): prepare v1.0.0"`
4. `git tag -a v1.0.0 -m "Release v1.0.0"`
5. `git push origin main && git push origin v1.0.0`
6. Create a GitHub release from the tag.

**Verify with:**
```bash
git tag -l v1.0.0
curl -sI https://api.github.com/repos/zawia-tech/wafine/releases/tags/v1.0.0 2>/dev/null | head -5
```

## (j) Rollback

If the cutover must be rolled back:

- [ ] **Point DNS back to the playground.** Restore the previous DNS records so traffic returns to the playground hosts. Do not delete the production zone unless the owner approves.
- [ ] **Revert Supabase Auth Site URL** if needed to the previous value.
- [ ] **Keep Vercel env vars** unchanged (they don't affect the playground). VM stack `.env` can remain as-is if the VM is shared, or revert as needed.
- [ ] **Document the rollback** in the runbook notes and inform the owner.

**Verify with:** DNS probes show traffic returning to the previous hosts, and the playground endpoints respond correctly.
