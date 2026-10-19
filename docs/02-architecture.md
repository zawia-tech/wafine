# Architecture

```
Browser ──► wa.<domain> (Vercel; server-side /api/bff proxy) ──► api.<domain>
Claude, n8n, scripts ─────────────────────────────────────────►  api.<domain>
                                          Cloudflare edge: TLS, WAF, no Access
                                                       │ outbound-only tunnel (cloudflared)
┌────────────────────────────────────────────────────────────────────────────────────┐
│ OCI af-casablanca-1 · VM.Standard.A1.Flex 2 OCPU / 12 GB · Ubuntu 24.04 arm64      │
│ zero inbound TCP/UDP · host tailscaled (Tailscale SSH, tailscale serve)            │
│                                                                                    │
│  ┌──────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐    │
│  │ openwa-      │──►│ openwa-bff :4000         │──►│ openwa-api :2785         │    │
│  │ cloudflared  │   │ (BFF, Hono/Bun)          │   │ (OpenWA engine,          │    │
│  └──────────────┘   │ published 127.0.0.1 only │   │  X-API-Key)              │    │
│                     └───────┬──────────────────┘   │ /app/data: main.sqlite,  │    │
│                             │ BullMQ               │ sessions/ (WA auth)      │    │
│                             ▼                      └────────────┬─────────────┘    │
│                     ┌──────────────────┐                        │ tailscale serve  │
│                     │ openwa-redis     │                        │ dashboard + /mcp │
│                     │ Valkey, noevict. │                        │ (tailnet only)   │
│                     └──────────────────┘                        │                  │
└────────────────────────────────────────────────────────────────────────────────────┘
Operators (Claude Code, SSH) ──► Tailscale ──► the VM (tailnet only)

bff and openwa-api ──► Supabase Postgres (eu-west-3, session pooler, TLS 5432)
openwa-api and backup.sh ──► Cloudflare R2 (HTTPS S3: media, encrypted backups)
```

## Decisions
| # | Decision | Why |
|---|---|---|
| 1 | **OpenWA (rmyndharis) built from source**, upstream compose kept unmodified + `stack/compose.infra.yml` override | User requirement. Upstream ships a hardened prod compose (read-only rootfs, `cap_drop: ALL`, non-root via gosu, healthchecks) and a multi-arch Dockerfile that installs Debian Chromium on arm64. An override keeps upgrades to `git checkout vX && deploy`. |
| 2 | **Supabase is OpenWA's own Postgres** (`DATABASE_TYPE=postgres`, `POSTGRES_SCHEMA=openwa`) | OpenWA has native Postgres support and migrates itself. That beats a custom webhook→DB bridge: no extra code, and messages, webhooks and outbox all land in Postgres. |
| 3 | Dedicated `openwa` schema + least-privilege role | Tables created by the `openwa` role don't inherit Supabase's default grants to `anon`/`authenticated`, and the schema isn't exposed by the Data API. |
| 4 | **Session pooler** (5432) + Supabase CA via `NODE_EXTRA_CA_CERTS` | OCI VMs are IPv4, and direct DB hosts are IPv6. OpenWA needs session-level settings, so not transaction mode. Certificates stay fully verified. |
| 5 | **Cloudflare R2, EU jurisdiction** for media + backups (owner decision 2026-10-18; an OCI Object Storage plan was superseded and never applied) | Buckets `openwa-media` and `openwa-backups` in `terraform/cloudflare`, bucket-scoped API token, no egress fees, no lifecycle expiry (keep all data). Setup and runbook: `docs/11-media-storage.md`. |
| 6 | Docker socket proxy disabled | It exists only for OpenWA's built-in datastore orchestration, which we don't use. Upstream SECURITY.md recommends disabling it then; it is host-root-equivalent if the API is compromised. |
| 7 | **Cloudflare Tunnel, remotely managed**, ingress `api.` → BFF | Our own domain with no inbound ports and no generated links. No Cloudflare Access in front of `api.`: the BFF's own Supabase session check is the gate (decision 2026-10-14). |
| 8 | **Tailscale on the host** (not a sidecar) | Tailscale SSH reaches the box itself. `tailscale serve` gives a tailnet-only HTTPS name for the dashboard and OpenWA's `/mcp`. |
| 9 | OpenWA's own `/mcp` is never routed through the tunnel | Upstream says never expose `/mcp` publicly (static key, no OAuth). The public MCP is the BFF's `/mcp`, gated by a user key or the BFF's OAuth server. |
| 10 | whatsapp-web.js engine by default | Lower ban risk than Baileys, per OpenWA's README. 12 GB fits ~10–15 sessions. |
| 11 | **Gateway private, never public** (captain decision 2026-10-11) | `gw.<domain>` has no DNS record and no tunnel rule (`gateway_public = false`). Operators reach the gateway over the tailnet or an SSH port-forward; the only public surfaces are `wa.` (Vercel) and `api.` (BFF). |

## Services on the VM
Compose project `openwa` (`OpenWA/docker-compose.yml` + `stack/compose.infra.yml`, always run through `stack/wa`):
- `openwa-api`: the OpenWA engine (port 2785), built from `OpenWA/` on the VM.
- `openwa-bff`: the BFF (`app/bff`), built on the VM. It publishes only `127.0.0.1:4000`, reaches the engine at `http://openwa-api:2785` and Valkey through `REDIS_URL`.
- `openwa-redis`: Valkey with `noeviction` (BullMQ must never drop job state).
- `openwa-cloudflared`: the tunnel connector. It starts only once `CLOUDFLARE_TUNNEL_TOKEN` is set (profile `public`). Its ingress rules are `api.` → `openwa-bff:4000` and a 404 for everything else.

Setup: [bootstrap](11-bootstrap.md) (`vm` mode ships the source and starts the stack); the BFF gateway key is installed and checked with `stack/gateway-key.sh`.

## Hostnames
- `wa.<domain>`: web app on Vercel (DNS-only CNAME). The only public page for people.
- `api.<domain>`: the BFF through the tunnel. Every `/api/*` route needs a Supabase session, `/auth/*` is rate-limited, and `/mcp` is key- or OAuth-gated.
- `gw.<domain>`: no record. The gateway stays private.
- `docs.<domain>`: public docs site on Vercel (indexable).

Records and tunnel ingress: `terraform/cloudflare/`; the web and docs sites are Vercel projects (`app/web`, `app/docs`).

## Capacity
whatsapp-web.js costs about 300–500 MB per session (OpenWA README). With `OPENWA_MEM_LIMIT=8g`, plan for **≤ 12 concurrent sessions** per A1 VM. For more, switch some sessions to Baileys (30–80 MB) or add a second VM. OpenWA supports multi-node with session leases; see `OpenWA/docs/13-horizontal-scaling.md`.

## What is NOT in Supabase
`main.sqlite` (API keys and audit; upstream hard-codes SQLite for it) and WhatsApp auth state (`sessions/`) stay on the VM volume. `stack/backup.sh` ships both, plus a schema-scoped `pg_dump`, to `openwa-backups` nightly. Set `BACKUP_AGE_RECIPIENT` to encrypt them, because session state can be used to take over the account.
