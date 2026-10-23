# Issue hygiene rules

Machine rules live in `scripts/issue-rules.json`; this page documents them for reviewers
and owners. The tooling is **dry-run by default**: nothing on GitHub changes until you pass
`--apply`.

## What the triage does per run

1. **Labels — add-only.** Every open issue should carry at least one `area:` label and one
   priority label (`P0`–`P3`). Work items from the backlog are keyed by the `ID: WF-0xx`
   line in their body and take their labels from `wf_map`; all other issues are labeled by
   keyword rules on title + first 4000 chars of body. An issue for which no `area:` label
   can be derived gets `status: needs-triage` instead — triage never guesses hard.
   Existing labels are never removed.
2. **Launch-blocking.** Any still-open P0 work item gets `status: launch-blocking`. These
   are never auto-commented or auto-closed by stale policy.
3. **Milestones.** `Milestone: Mx` from the body (or an `Mx ` title for the milestone
   tracker issues) is enforced against the repo's milestone objects; apply mode creates
   missing milestone objects from the `milestones` table (with due dates) and attaches the
   issue.
4. **Stale issues.** After the repo's threshold without any activity, a tagged
   `<!-- issue-hygiene -->` comment nudges for a status. Closing additionally requires
   `--close-stale` with `--apply`. A hygiene comment is never written twice.

## Stale thresholds and PR rules

| Rule | Value |
|---|---|
| Issue stale threshold (default) | 60 days |
| Long-lived dev repo threshold (pass `--stale-days 180`) | 180 days |
| PR "open for too long" | 7 days (override `--stale-days`) |
| PR CI flags | no check runs, failing checks, runs still pending |
| Bot PRs | flagged in the report only; never commented |

## Keyword → label rules (issues)

| Match (case-insensitive) | Labels |
|---|---|
| `M\d+ <date …>` title | `type:task` (tracker/epic issue) |
| rate limit, trigram, XSS, crlf, RLS, secret, CVE, auth bypass, revocation | `area:security` |
| "security" anywhere | `type:security` |
| changelog, README, i18n, RTL, translate, Arabic, French, docs | `area:docs` |
| landing, hero, stub pages, a11y, boundary, Next.js, OG image | `area:web` |
| OAuth, BFF, gateway proxy, presign, rate | `area:bff` |
| R2, media, backup, tunnel, terraform, tofu, OCI, DNS, VPS, nginx, caddy | `area:infra` |
| Dependabot, actions, checkout, upload-artifact, CI, workflow, billing | `area:ops` |
| logo, brand pack, design system, SVG, banner | `area:brand` |
| invite, waitlist, pricing, beta | `area:growth` |
| bug, broken, error, regression, fails, cannot | `type:bug` |
| CVE, secret leak, auth bypass, RCE, SQL injection | `P0` |
| security, hardening | `P1` |

## PR path → label rules

| Path prefix | Label |
|---|---|
| `terraform/`, `stack/`, `dns/` | `area:infra` |
| `app/web/` | `area:web` |
| `app/bff/` | `area:bff` |
| `app/docs/` / `docs/` | `area:docs` |
| `scripts/`, `.github/`, `CHANGELOG.md` | `area:ops` |

## Repo slugs

Repo slugs are only passed on the command line (`--repo OWNER/NAME`), never stored in this
file or in `issue-rules.json`, so the public-safe rule set cannot leak the private dev
repo's name through this file.

## Commands

```bash
# Dry-run on the release tracker (report to stdout)
bun scripts/triage-issues.ts --repo OWNER/NAME

# Apply labels + milestones on both repos (release repo 60d default; dev repo 180d)
bun scripts/triage-issues.ts --repo OWNER/NAME --apply
bun scripts/triage-issues.ts --repo OWNER/NAME --apply --stale-days 180

# Nightly cron (dry-run report only — see the Hermes cron job `wafine-issue-hygiene`)
bun scripts/triage-issues.ts --repo OWNER/NAME --stale-days 180 --report-dir DIR

# PR hygiene
bun scripts/triage-prs.ts --repo OWNER/NAME --repo OWNER/NAME2
bun scripts/triage-prs.ts --repo OWNER/NAME --apply
```

Reports are also written to the ops `auxdocs/reports/` hub when `--report-dir` points there.

## Safety properties

- Default = dry-run. State changes require an explicit `--apply`.
- Auto-close requires `--apply --close-stale`; `status:launch-blocking` issues are exempt.
- Comments carry the `<!-- issue-hygiene -->` marker so reruns skip them.
- Only `gh api` calls under the hood; no tokens are read or written by the scripts.
