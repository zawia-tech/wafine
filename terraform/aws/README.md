# terraform/aws — OpenWA staging host

Provisions an arm64 EC2 host that runs the OpenWA stack **without needing the
tailnet**. It exists because the OCI VM is reachable only over Tailscale SSH and
the tailnet join is still pending admin approval, so the deployed box cannot be
inspected.

## Why AWS at all

| | OCI (`terraform/oci`) | AWS (`terraform/aws`) |
|---|---|---|
| Shell access | Tailscale SSH — **blocked on tailnet approval** | **SSM Session Manager** — IAM only, no open port, no key |
| Ingress | Cloudflare Tunnel | Cloudflare Tunnel (same) |
| Inbound ports | none | none |
| Architecture | arm64 (Ampere A1) | arm64 (Graviton T4g) |
| Cost | Always Free (2 OCPU / 12 GB) | **bills against Free Tier credits** |

SSM is genuinely better than Tailscale SSH for access: no long-lived SSH key, no
inbound port, every session recorded in CloudTrail, and it works before any
tailnet exists. That is the real reason this module is worth having — not just
"we had an AWS account".

## ⚠️ Read this before applying: it is not free

**The T4g free trial does not cover a usable instance size.**

- The trial covers **`t4g.small`** (2 vCPU / **2 GB**), 750 hrs/month, extended
  to **2026-12-31** for all customers.
- `stack/compose.infra.yml` sets **`mem_limit: 8g`** on `openwa-api`, and
  whatsapp-web.js runs a **headless Chromium per session** (roughly 300–600 MB
  each) on top of Node and Docker.
- **2 GB will OOM.** The module therefore defaults to **`t4g.large`** (2 vCPU /
  8 GB), which has **no free allowance** and bills against Free Tier credits.

Rough monthly cost while running:

| Item | ~USD/month |
|---|---|
| t4g.large (8 GB) | ~60 |
| 100 GB gp3 EBS | ~8 (billed even when the instance is stopped) |
| Public IPv4 | ~3.60 |

Treat these as **indicative, not quoted** — verify against the current AWS
pricing page for your region before relying on them. The point is the shape:
a credit-based Free plan carries roughly **$100–200 total**, so a t4g.large
consumes the balance in **well under six months**, and a Free-plan account
**closes automatically when credits run out**.

**The module sets a budget alert for exactly this reason** (`budget_alert_usd`,
default 75, with `budget_alert_emails` required). Do not apply without it.

Cheaper options if the credits matter more than fidelity:
- `t4g.medium` (4 GB) — one or two WhatsApp sessions, tight but workable.
- Keep the instance stopped between test runs. EBS and the IPv4 still bill.

## Usage

Operate it **through the repo wrapper, never bare `terraform`** (`scripts/tf`
keeps state and provider caches out of the working tree; `make tf-aws-*` wraps
it). Recommended flow — from the dev worktree so staging state never coexists
with the OCI production workspace:

```bash
make dev-up        # ../openwa-oci-infra-dev on mo/dev-local-env (scripts/dev-env)
cd ../openwa-oci-infra-dev
cp terraform/aws/terraform.tfvars.example terraform/aws/terraform.tfvars
                   # set region + budget_alert_emails (see below)
aws login          # REQUIRED — no ambient credentials
make tf-aws-plan
make tf-aws-apply
```

Raw equivalents: `scripts/tf aws init|plan|apply|destroy`.

Then reach the host — **SSM Session Manager replaces Tailscale SSH**:

```bash
make aws-ssh       # aws ssm start-session --target $(scripts/tf aws output -raw instance_id)
```

Bring up the stack on the host exactly as on OCI (`./stack/wa …`). The
Cloudflare Tunnel runs as a container **on this host**, so the tunnel's ingress
target is unchanged (`http://openwa-api:2785`) — only which machine runs
`cloudflared` differs.

## Design decisions worth knowing

- **No `key_name`.** Access is SSM only. Adding a key would reintroduce the
  long-lived credential this design removes.
- **`cpu_credits = "standard"`.** Surplus CPU credits on T4g are billed; on a
  credit-based plan that is the most likely surprise charge. We accept
  throttling instead.
- **IMDSv2 required, hop limit 1.** A compromised container cannot reach
  instance credentials. Matches the OCI module's concern that the metadata
  endpoint must never be reachable from a wider network.
- **No Tailscale sysctl block.** This host does not join a tailnet, so
  `net.ipv4.ip_forward` would only widen the blast radius.
- **No ingress rules at all** unless `enable_break_glass_ssh` is set *and*
  `admin_cidr` is non-empty.

## Region

Defaults to `us-east-1` only because `~/.aws/config` names it. This box serves
Morocco and **us-east-1 is ~100–120 ms away**; `eu-west-3` (Paris) or
`eu-south-2` (Spain) are ~30–45 ms. For a WhatsApp gateway every round-trip is
user-visible — **prefer a European region.**

## Not done here

- No state backend — local state. If this becomes long-lived, add an S3 backend
  with locking; local state in a git working tree is a footgun.
- No Cloudflare resources — the tunnel, DNS and Access policies stay in
  `terraform/cloudflare`, which is provider-agnostic about where `cloudflared`
  runs.
- Not production. It is a staging box, tagged `Environment = "staging"`.
