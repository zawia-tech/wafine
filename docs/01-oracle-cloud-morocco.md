# Oracle Cloud for Morocco — research notes (2026-10-07)

Facts verified on the date above; volatile ones (free-tier limits, capacity) should be rechecked before big decisions.

## What oracle.com/africa-fr/cloud offers
- It's a generic OCI pitch in French. The page has **no Morocco-specific content**. Oracle claims 50 commercial and government regions, 200+ services, and the same price everywhere. It also claims lower compute, block-storage and egress prices than other hyperscalers (US East comparison, Sept 2024).
- Free tier: 20+ Always Free services and US$300 of credits for **30 days**. The French page says "30 heures", which is a translation error; the FAQ says 30 days.
- Sales: a contact form at `/africa-fr/cloud/contact-form.html` and a chat with a Moroccan sales line (+212 522 977 308). No startup program is listed on that page.
- Source: https://www.oracle.com/africa-fr/cloud/ · FAQ https://www.oracle.com/cloud/free/faq/

## Regions
| Region | Identifier | Notes |
|---|---|---|
| **Morocco West (Casablanca)** | `af-casablanca-1` (LEJ) | **Live since April 2026**, hosted with N+ONE Datacenters. Single AD. Oracle promises in-country data hosting. |
| Morocco 2 (Settat) | — | announced, "coming soon" |
| Madrid / Marseille / Paris | `eu-madrid-1`, `eu-marseille-1`, `eu-paris-1` | next-nearest; Moroccan subsea cables land in Marseille |
| Johannesburg | `af-johannesburg-1` | far from Morocco in network terms |

Sources: Oracle announcement https://www.oracle.com/africa-fr/news/announcement/oracle-first-hyperscaler-open-public-cloud-2026-04-07/ · region list https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm · status https://www.oracle.com/cloud/public-cloud-regions/

**Decision:** use `af-casablanca-1`. It has the lowest latency to Moroccan users and keeps compute in-country. **Unverified:** whether Casablanca can be chosen as home region at Free Tier sign-up and how much A1 capacity it has. Check during sign-up. The home region is permanent.

## Always Free (what our VM fits in)
- **Ampere A1: 2 OCPU / 12 GB total.** Halved from 4/24 around June 2026; enforcement emails mentioned termination of over-limit instances from 18 Aug 2026. Pay-As-You-Go accounts may still be allowed 4/24; that's unofficial and contradictory, so don't plan on it.
- 2× E2.1.Micro (1/8 OCPU, 1 GB); too small for Chromium.
- 200 GB block storage (boot + volumes), 20 GB Object Storage (Always-Free-only accounts), 10 TB/month egress.
- **Home region only.**
- "Out of host capacity" on A1 is common. Casablanca has one AD, so the options are retrying (`scripts/oci-a1-retry.sh`) or upgrading to Pay-As-You-Go (no charge while within free limits).
- **Idle reclaim:** Always-Free-only instances can be reclaimed when CPU p95, network and memory all stay < 20 % for 7 days. A light OpenWA load can look idle. Upgrading to PAYG avoids this.

Sources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm · https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/

## Networking gotchas on OCI
- OCI Ubuntu images ship `/etc/iptables/rules.v4` ending in a REJECT. Oracle says not to use ufw ("might cause an instance not to boot") and not to delete the iSCSI rules (169.254.0.2:3260, 169.254.2.0/24). Docker and tailscaled insert their own chains ahead of the REJECT. **Don't reload rules.v4 while Docker runs.**
- Security lists and NSGs are additive and stateful. We keep a single security list: egress all, ingress only ICMP 3/4 (path-MTU; the OCI MTU is 9000).
- cloudflared and tailscaled only dial out, so **no inbound port is needed**. Tailscale falls back to DERP relays.
- Tailscale's own OCI guide (https://tailscale.com/docs/install/cloud/oracle-cloud) recommends:
  - `--accept-dns=false`: **adopted**.
  - UDP 41641 inbound: available as `tailscale_direct_udp`, off by default.
  - Advertising the subnet plus `169.254.169.254/32`, with split DNS for `oraclevcn.com`: **not used**. It would expose instance metadata to the tailnet.

Sources: https://docs.oracle.com/en-us/iaas/Content/Compute/References/bestpracticescompute.htm · https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm · https://tailscale.com/kb/1149/cloud-oracle

## Data protection (Morocco, law 09-08)
- Transfers of personal data abroad require an "adequate" destination or prior CNDP authorisation. EU countries are generally treated as adequate.
- Compute in `af-casablanca-1` stays in Morocco, but **Supabase (Paris, eu-west-3) is still an international transfer** for WhatsApp messages and contacts.
- For client or production use, get this checked. This is not legal advice.
- Source: https://upsilon-consulting.com/transfert-international-donnees-personnelles-maroc/

## Tooling and integrations for agents
| Tool | Install | Use |
|---|---|---|
| OCI CLI | `brew install oci-cli` then `oci setup config` | reads, power actions |
| OpenTofu / Terraform `oracle/oci` provider (9.x) | `brew install opentofu` | durable infra (`terraform/oci`) |
| Oracle MCP (official) | `uvx oracle.oci-cloud-mcp-server@latest` (already in `.mcp.json`) | any OCI SDK call from Claude: `list_client_operations` → `describe_oci_operation` → `invoke_oci_api` |
| More Oracle MCP servers | `uvx oracle.oci-<compute|networking|object-storage|limits|usage|…>-mcp-server` | narrower tool sets (github.com/oracle/mcp, 30+ servers; marked "not for production") |
| Oracle Claude Code plugin | `/plugin marketplace add oracle/skills` → `/plugin install oci@oracle-skills` | OKE, IoT, Enterprise AI. No compute or networking, hence our own `oci-ops` skill |
| oracle.com/mcp | — | Oracle's MCP landing page, database-centric: SQLcl `sql -mcp`, OCI Database Tools MCP, ORDS `/mcp`, MySQL. Relevant only if we adopt Autonomous DB |

Sources: https://www.oracle.com/mcp/ · https://github.com/oracle/mcp · https://github.com/oracle/skills · https://registry.terraform.io/providers/oracle/oci
