# Claude connector (OAuth for MCP)

Decision 2026-10-14 (captain): users add WhatsApp to Claude (claude.ai, Desktop, mobile, Cowork, Claude Code) as a
custom connector at `https://api.example.com/mcp`. Claude can't send our `X-API-Key`, so the BFF is also an
OAuth 2.1 authorization server, per the MCP authorization spec and Claude's connector requirements
(https://claude.com/docs/connectors/building/authentication).

## Flow
```text
Claude -> POST /mcp (no token)            401  WWW-Authenticate: Bearer resource_metadata="<api>/.well-known/oauth-protected-resource/mcp", scope="whatsapp"
Claude -> GET  /.well-known/oauth-protected-resource/mcp     { resource: <api>/mcp, authorization_servers: [<api>] }
Claude -> GET  /.well-known/oauth-authorization-server       S256, registration_endpoint, auth method none
Claude -> POST /oauth/register            redirect_uris must be Claude's callback or loopback -> client_id (public)
browser -> GET /oauth/authorize           PKCE S256 required; resource must be <api>/mcp -> 302 wa.<zone>/oauth/consent?request=…
browser -> wa.<zone>/oauth/consent        Supabase login (?next= back here), shows app + redirect host, Allow/Deny
           POST /api/oauth/requests/:id/approve   -> code (5 min, single use) -> redirect to Claude with code, state, iss
Claude -> POST /oauth/token (form)        verifies PKCE + redirect_uri, mints an OpenWA operator key scoped to the
                                          user's session, seals it (AES-256-GCM, OAUTH_ENC_KEY, bound to the grant id),
                                          returns opaque access (1 h) + refresh (30 d, rotating) tokens
Claude -> POST /mcp  Bearer <access>      BFF resolves the hash, opens the sealed key, forwards to OpenWA /mcp with it
```

## Security properties
- Tokens are opaque, stored as SHA-256 only, bound to one grant; Claude's token never reaches OpenWA
  (no token passthrough). OpenWA enforces the engine key's `allowedSessions` on every MCP tool.
- Registration accepts only `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`
  and http loopback redirects (matched without the port, RFC 8252; Claude Code). Unknown client or redirect = 400,
  never a redirect. The consent page shows the redirect host and warns on loopback.
- Refresh tokens rotate; reusing a rotated one revokes the whole connection and its engine key.
- Disconnect from `/whatsapp` (Connected apps), `POST /oauth/revoke`, or deleting the WhatsApp session revokes the
  grant and its engine key. Rate limits: register 20/min/IP, token 60/min/IP, MCP 120/min per connection.
- Pending sign-in requests and codes live in BFF memory (10 min / 5 min); a BFF restart only cancels in-flight sign-ins.

## Operate
- VM `stack/.env`: `OAUTH_ENC_KEY` (32 random bytes, base64; `openssl rand -base64 32` on the VM, never in git or
  chat). Changing it breaks every existing connection (users reconnect). Empty = OAuth server off, API keys still work.
  `WEB_URL` and `PUBLIC_API_URL` default to the production hostnames.
- Migration: `supabase/migrations/20261014200000_oauth_connectors.sql` (`oauth_clients`, `oauth_grants`, `oauth_tokens`).
- Each fresh Claude connection registers a new client (DCR). Clean up `oauth_clients` without grants if it grows.

## Use
In Claude: Settings → Connectors → Add custom connector → URL `https://api.example.com/mcp`, OAuth fields empty
→ Connect → sign in on the web host (production `https://app.example.com`) → Allow. A WhatsApp session must exist first (`/whatsapp`).
