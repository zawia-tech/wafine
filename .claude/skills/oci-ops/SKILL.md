---
name: oci-ops
description: Operate this project's Oracle Cloud (OCI) footprint in Morocco — auth checks, Always Free limits, launching the Ampere A1 VM with capacity retries, instance power actions, break-glass console access, and security-list audits. Use whenever the user mentions Oracle Cloud, OCI, Casablanca region, A1/Ampere, "out of capacity", compartments, VCN/security lists, or the wafine-vm VM itself.
---

# OCI operations (af-casablanca-1)

## Facts this project relies on (checked 2026-10-07 — re-verify if a decision hinges on them)
- Region: **Morocco West (Casablanca) `af-casablanca-1`**, key `LEJ`, realm OC1, **one AD** (no AD fallback on capacity errors). Live since April 2026.
- Always Free A1 = **2 OCPU / 12 GB total** (cut from 4/24 in June 2026). Block storage 200 GB total (boot + volumes), 10 TB/month egress.
- Always Free resources exist **only in the home region**, chosen at sign-up and not changeable.
- Idle reclaim: Always-Free-only tenancies can lose instances whose CPU p95, network and memory are all < 20 % over 7 days. Upgrading to Pay-As-You-Go (still $0 within free limits) removes that risk and helps with capacity.
- Details and sources: `docs/01-oracle-cloud-morocco.md`.

## Tooling, in order of preference
1. **OpenTofu via `scripts/tf oci …`** (never bare `tofu`: the wrapper keeps `.terraform/` outside the repo tree, where macOS Finder `Icon` files break provider checksums) for anything that should exist durably (VCN, subnet, security list, instance). Never click-create durable resources.
2. **OCI CLI** (`oci`, profile in `~/.oci/config`) for reads and one-off actions.
3. **Oracle's MCP server** `oci` (from `.mcp.json`, `uvx oracle.oci-cloud-mcp-server`) when an SDK call is easier than CLI flags. Workflow: `list_client_operations` → `describe_oci_operation` → `invoke_oci_api`. It can call ANY SDK method (including terminate/delete). Treat it like a root shell.

## Guardrails
- Before any destructive call (terminate, delete, detach, security-list change that opens ingress), show the exact command or SDK call and get an explicit yes.
- Ingress must stay closed. The only allowed rule is ICMP 3/4 (path-MTU), plus port 22 from `admin_cidr` if it was deliberately set. cloudflared and tailscaled only dial out.
- Do not reload `/etc/iptables/rules.v4` on the VM while Docker runs (it wipes Docker's chains). If you must, restart Docker afterwards. Never enable ufw on OCI Ubuntu images.

## Recipes

Auth / context check:
```bash
oci iam region-subscription list --query 'data[].{region:"region-name",home:"is-home-region"}' --output table
oci iam compartment list --compartment-id-in-subtree true --query 'data[].{name:name,id:id}' --output table
oci limits value list --compartment-id "$TENANCY" --service-name compute \
  --query "data[?contains(name,'standard-a1')]" --output table
```

Launch / converge the VM (plans once, then retries on "Out of host capacity"):
```bash
scripts/oci-a1-retry.sh 120
```

Power actions (`ACTION` = START | STOP | SOFTRESET | RESET):
```bash
oci compute instance action --instance-id "$(scripts/tf oci output -raw instance_id)" --action SOFTRESET
```

Break-glass when Tailscale is down (no public SSH): OCI Console → Instance → **Cloud Shell connection** / serial console, or temporarily set `admin_cidr = "<your-ip>/32"` and `scripts/tf oci apply`, then revert.

Security audit (expect no TCP/UDP ingress):
```bash
oci network security-list list --compartment-id "$COMPARTMENT" \
  --query 'data[].{name:"display-name",ingress:"ingress-security-rules"}'
```

## Related
- Oracle's official plugin marketplace (Claude Code): `/plugin marketplace add oracle/skills`, then `/plugin install oci@oracle-skills`. It covers OKE, IoT and GenAI, not compute or networking. This skill fills that gap.
- Other servers in github.com/oracle/mcp (compute, networking, object-storage, limits, usage…): `uvx oracle.oci-<name>-mcp-server`.
