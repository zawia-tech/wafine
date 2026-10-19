---
name: wafine-send-message
description: Send and read WhatsApp messages via WAFINE REST or MCP. Use when sending texts, media, replies, forwards, reading messages, or checking send limits and pacing.
---

# WAFINE Send Message

Send and read messages through the public passthrough (REST) or via MCP tools exposed through the BFF.

## Auth & base URLs
- REST base: `${PUBLIC_API_URL:-http://localhost:4000}/wa` (prefixes shown below). Auth header: `X-API-Key: <your-api-key>`.
- MCP: `${WAFINE_MCP_URL:-http://localhost:4000/mcp}` (Streamable HTTP). Auth: Bearer token from Claude OAuth connector; BFF forwards to OpenWA with scoped engine key.
- All operations are scoped to your own WhatsApp session. Only one session per user.

## REST routes (exact from BFF)
From `app/bff/src/adapters/http/routes/wa.ts`:
- `GET /wa/session` - get current session (or null). If phone mismatch → `phone_mismatch`.
- `POST /wa/session` - create + start session (name `u-<userId>`, 201 on create; 409 if exists).
- `POST /wa/session/start` - start existing session.
- `GET /wa/session/qr` - poll QR (`qrCode`, `status`).
- `POST /wa/session/logout` - logout session.
- `DELETE /wa/session` - delete session and revoke keys (204).
- `GET /wa/keys` - list API keys.
- `POST /wa/keys` - mint API key (max 5 active; plaintext returned once, stored hashed).
- `POST /wa/keys/:id/revoke` - revoke API key.
- `GET /wa/connect-info` - returns `{ restBase: ".../wa", mcpUrl: ".../mcp", authHeader: "X-API-Key" }`.

Message operations (require own session; paths under `/wa/sessions/...`):
- `GET /wa/sessions` - list sessions (filtered by OpenWA scope)
- `GET /wa/sessions/:id/messages` - read messages (paginated)
- `POST /wa/sessions/:id/messages/send-text` - send text
- `POST /wa/sessions/:id/messages/send-image` - send image  
- `POST /wa/sessions/:id/messages/send-document` - send document
- `POST /wa/sessions/:id/messages/send-audio` - send audio
- `POST /wa/sessions/:id/messages/reply` - reply to message
- `POST /wa/sessions/:id/messages/forward` - forward message
- `POST /wa/sessions/:id/messages/send-bulk` - bulk send (billed per item)

## MCP tools
MCP requests go to BFF `/mcp` which proxies to OpenWA’s MCP with the scoped engine key. Tool names exposed depend on OpenWA’s MCP tools; sends count via BFF budget when calling send tools (`MessageSend*`, `MessageReply`, `MessageForward`). Reads/reactions do not count toward API send budget.

## Send limits & pacing
- API send budget (BFF): default 300/day UTC, 10/min per session. Sends counted: REST send-*, reply, forward (1 each), send-bulk (1 per item), MCP `MessageSend*`, `MessageReply`, `MessageForward`. Reads/reactions not counted. Refunded if engine refuses (≥400). Over limit: REST 429 `{code: API_SEND_LIMIT}` with `Retry-After`; MCP tool error `isError: true`.
- Engine pacing: `SEND_PACING_ENABLED=true` (circuit-breaker). Owner’s own phone/WA Web messages count toward engine pacing on personal numbers.
- 120 req/min per key, 16 MiB body cap, 60s timeout. Only `content-type`, `accept`, `mcp-protocol-version`, `idempotency-key` forwarded.

## Examples
```bash
# List sessions
curl -H "X-API-Key: $WAFINE_KEY" "$PUBLIC_API_URL/wa/sessions"

# Send text
curl -X POST -H "X-API-Key: $WAFINE_KEY" -H "Content-Type: application/json" \
  "$PUBLIC_API_URL/wa/sessions/$SID/messages/send-text" \
  -d '{"to":"+212...", "text":"Hello"}'

# Get QR
curl -H "X-API-Key: $WAFINE_KEY" "$PUBLIC_API_URL/wa/session/qr"
```

## References
- `docs/09-sessions-keys-mcp.md`, `app/bff/src/adapters/http/routes/wa.ts`, `app/bff/src/adapters/http/routes/gateway-proxy.ts`
