---
name: wafine-connect-claude
description: Connect WAFINE to Claude Code, Claude Desktop, or claude.ai. Use when adding the MCP connector, completing OAuth consent, or troubleshooting connection issues.
---

# WAFINE Connect Claude

Connect WAFINE MCP to Claude via custom connector with OAuth 2.1.

## Prerequisites
- WhatsApp session ready (`/whatsapp` shows connected/ready). See `wafine-onboard` J2.
- MCP URL: `${WAFINE_MCP_URL:-http://localhost:4000/mcp}`
- BFF has `OAUTH_ENC_KEY` set (required for Claude connectors). API keys still work if OAuth disabled.

## Claude Code
```bash
claude mcp add --transport http whatsapp ${WAFINE_MCP_URL:-http://localhost:4000/mcp}
```
Follow OAuth browser flow when prompted.

## Claude Desktop
1. Open Settings → Connectors → Add custom connector
2. URL: `<WAFINE_MCP_URL>/mcp` (e.g. `http://localhost:4000/mcp`)
3. Leave OAuth fields empty
4. Connect → complete OAuth consent in browser (sign in, allow)

## claude.ai
1. Go to Connectors → Add custom connector
2. URL: `<WAFINE_MCP_URL>/mcp`
3. OAuth auto-detected; leave fields empty
4. Connect and complete consent

## OAuth flow
1. `GET /.well-known/oauth-protected-resource/mcp` → resource metadata
2. `GET /.well-known/oauth-authorization-server` → auth metadata (PKCE S256)
3. `POST /oauth/register` → DCR (only Claude callbacks/loopback accepted)
4. Browser to consent page (`/oauth/consent?request=...`); sign in + Allow
5. `POST /oauth/token` → exchange code for opaque access (1h) + rotating refresh (30d)
6. MCP calls use `Bearer <access>`; BFF resolves to scoped engine key

## Troubleshooting
- 401 with WWW-Authenticate: OAuth not complete → reconnect connector
- Redirect URI rejected: only Claude callbacks/loopback allowed
- No WhatsApp session: create/connect session first
- Connection revoked: can reconnect; revoking/disconnect kills grant+key
- OAuth broken after key change: `OAUTH_ENC_KEY` changed → all connections break (users must reconnect)

## References
- `docs/10-claude-connector.md`
