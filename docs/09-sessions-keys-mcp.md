# WhatsApp sessions, API keys and MCP for users

Decision 2026-10-14 (captain): a signed-in user creates their own WhatsApp session in the web app, scans its QR,
and gets an API key that works on a public REST passthrough and a public MCP endpoint, with read **and send**.

## Flow
```text
wa.<your-domain>/whatsapp  (Supabase session)
  -> /api/bff/api/wa/session          POST create + start   (one session per user, name u-<userId>)
  -> /api/bff/api/wa/session/qr       poll every 3 s while qr_ready (data:image/png;base64 from OpenWA)
  -> /api/bff/api/wa/session          status; when ready, the linked phone must equal the invited number
                                      (otherwise the BFF logs the device out: status phone_mismatch)
  -> /api/bff/api/wa/keys             POST mint key: OpenWA role operator, allowedSessions=[own session],
                                      plaintext shown once, BFF stores only SHA-256 (wa_api_keys); max 5 active
user / agent with the key:
  https://api.<your-domain>/wa/<path>  -> OpenWA /api/<path>   (REST)
  https://api.<your-domain>/mcp        -> OpenWA /mcp          (Streamable HTTP, POST only)
```

## Gates on the public passthrough (`app/bff/src/adapters/http/routes/gateway-proxy.ts`)
1. The key's SHA-256 must be an active, user-issued key in `wa_api_keys`. The engine's admin key, or any key not
   minted through the web app, never works from the internet.
2. OpenWA enforces the key scope (`allowedSessions`, role operator) on every route and every MCP tool.
3. REST paths are confined to `sessions` (list, filtered by OpenWA) and `sessions/<own id>/...`. Refused before the
   engine: other sessions, every non-session route (`auth/api-keys`, `settings`, `webhooks`, …), `DELETE sessions/<id>`,
   `force-kill`, `proxy`, `config`, and any decoded segment with `/`, `\`, `..` or NUL.
4. 120 requests per minute per key; 16 MiB body cap; 60 s timeout; only `content-type`, `accept`,
   `mcp-protocol-version`, `idempotency-key` are forwarded, and the key is re-sent as `X-API-Key`.
5. **API send budget** per WhatsApp session (default 300/day UTC, 10/min; admins change the global caps and
   per-session overrides live from `/admin`). Charged: REST `messages/send-*`, `reply`, `forward` (one each),
   `send-bulk` (one per item), MCP `tools/call` of `MessageSend*`, `MessageReply`, `MessageForward`, and workflow
   auto-replies. Reads, reactions and everything the owner sends from the phone or WhatsApp Web are never counted.
   A send the engine refuses (HTTP ≥ 400) is refunded. Over the cap: REST answers `429 {code: API_SEND_LIMIT}` with
   `Retry-After`; MCP answers a tool error (`isError: true`) so the agent can tell its user. Counters live in Valkey.
6. A user disabled from `/admin` gets 403 on `/api/*`, `/wa/*` and `/mcp` (keys and connectors included).

## Engine settings (VM `stack/.env`)
- `MCP_ENABLED=true`, `MCP_READONLY=false` (send tools on; captain decision). MCP sends are capped by the BFF's
  API send budget (gate 5), not by the paced sender.
- `SEND_PACING_ENABLED=true` with `SEND_PACING_WARMUP_SCHEDULE=100000` and `SEND_PACING_COLD_DAILY_CAP=off`.
  OpenWA's pacing counts every OUTGOING row of the session, including the owner's own phone and WhatsApp Web
  messages, so on a personal number its daily caps ran out with zero API sends ("Daily send allowance of 80 reached",
  2026-10-16). It stays on only for its consecutive-failure circuit breaker.
- The BFF's `OPENWA_API_KEY` must be an unscoped **admin** key (it mints and revokes user keys).
- `PUBLIC_API_URL` (BFF) has no production default: set it in every deployment (dev falls back to
  `http://localhost:4000`). It is the public origin the BFF shows users as their REST base and MCP URL.

## Database
`supabase/migrations/20261014180000_wa_sessions_keys.sql`: `wa_sessions` (user -> OpenWA session) and `wa_api_keys`
(hashes only). Both cascade from `user_profiles`, so removing a number from the allowlist removes the user's session
mapping and keys. RLS on, no policies; the BFF connects as the table owner.

## Known limits
- One session per user. Deleting the session revokes all its keys.
- MCP and REST sends bypass the BFF's per-contact pacing, and with the engine's cold-reachout cap off nothing
  limits first messages to strangers specifically; the API send budget bounds volume only. Ban risk sits with the
  number owner.
- Budget tables: `supabase/migrations/20261016120000_admin_backoffice.sql` (`bff_settings`, `wa_session_limits`,
  `user_profiles.disabled_at`).
- `/mcp` on the **gateway** hostname stays 404 (`terraform/cloudflare`); the public MCP is the BFF's, key-gated.
