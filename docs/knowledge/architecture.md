# Architecture

## Request path
Browser → web app (Vercel) → same-origin proxy `/api/bff` → edge rewrite project (`app/api-edge`) → private tunnel (Tailscale Funnel) → **BFF** on the VM → **OpenWA** gateway (port 2785, tailnet-only).
The browser never calls the BFF directly. The VM opens no inbound port.

## Components
| Part | Role |
|---|---|
| `app/bff` | Hono API. Auth, allowlist, roles, API keys, OAuth 2.1 server, MCP, workflow engine, webhook receiver, media presign. Runs beside Valkey in the VM compose project. |
| `app/web` | Next.js app and marketing site. Tailwind 3.4 + daisyUI 4. Messages in `messages/{en,fr,ar}.json`. |
| `app/docs` | Fumadocs site. Public and indexable. A test blocks internal terms from its content. |
| OpenWA | WhatsApp engine. Holds sessions and its own SQLite (`main.sqlite`, API keys, audit) on the VM volume. |
| Supabase Postgres | Application data (EU region). The session pooler on port 5432 is the only supported connection. |
| Cloudflare R2 (EU) | Media and encrypted backups. Private bucket. Users get short-lived presigned links from the BFF. |

## Auth and access
- Sign-up is invite-only: an admin adds an E.164 number to the allowlist, and `/auth/signup` accepts only allowlisted numbers.
- Sessions are Supabase tokens kept in `sessionStorage`, sent as `Authorization: Bearer`. There are no auth cookies.
- Roles: owner, admin, support, viewer, user. Owners come from `ADMIN_EMAILS`.
- API keys are minted only by the BFF and scoped to a session or chat.
- OAuth for Claude connectors: PKCE S256, scopes `whatsapp` and `offline_access`, refresh-token rotation.
- MCP is stateless Streamable HTTP, POST only.

## Sending and limits
- Auto-replies go through `PacedReplySender` (gap and daily cap). REST and MCP sends use the BFF send budget but are not gap-paced.
- Incoming webhooks are verified with HMAC-SHA256 and an idempotency key.
- Rate limits are in-process per BFF instance.

## Data rules
- Keep all data. Retention settings stay at 0 and nothing expires by default.
- WhatsApp auth state is a login credential. Never commit it. Backups should be age-encrypted.
- Schema changes are a new file in `supabase/migrations/`, applied with `supabase db push`.
