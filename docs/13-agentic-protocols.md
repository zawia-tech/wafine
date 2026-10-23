# 13 — Agentic protocols: skills pack and a proposed A2A study for WAFINE

**Status:** study note + proposed design (nothing here is implemented). Date: 2026-10-17.
**Companion skills (this pack, `skills/`):**
`agentic-a2a-protocol`, `agentic-protocol-landscape`, `agentic-ipc-rpc`,
`agentic-sockets-streaming`, `agentic-herdr-orchestration`.
**Sources:** `<operator-docs>/research/a2a.txt` (A2A spec v1.0.0 extract),
`<operator-docs>/research/{acp.txt,acp3.md,acp4.md}` (Agent Communication Protocol),
`<operator-docs>/research/mcp-transports.md` (MCP transports); repo code as cited inline.

## 1. Why study agent protocols now
WAFINE already speaks one agent protocol well: the BFF exposes an MCP server at
`/mcp` behind OAuth 2.1 (`docs/10-claude-connector.md`, `docs/09-sessions-keys-mcp.md`).
MCP connects a model to **tools**. The owner's roadmap ("toward a true autonomous
agentic workflow system") points at the next step: letting independent agents hand
WAFINE a goal and watch it complete. That is A2A's job, and it needs a study before
any code. This note is the study; the skills pack is the working knowledge base.

## 2. The protocol landscape in one table
| Protocol | Links | Unit of work | WAFINE today |
|---|---|---|---|
| **MCP** | model ↔ tools/resources | tool call | **shipped** (`/mcp`, OAuth 2.1) |
| **A2A** | agent ↔ agent | task + artifacts | none (this study) |
| **ACP** (Agent Communication Protocol, IBM) | agent ↔ agent | run, with `Await` | none |
| **ACP** (Agent Client Protocol, editors) | editor ↔ coding agent | session | via `hermes`/`opencode` locally |
| **ANP** | open agent network | — | none; experimental |

Two different specs both abbreviate to "ACP" — always spell out which. A2A and ACP are
peer protocols; MCP stays *inside* one agent to reach its tools. They compose:
an A2A server uses MCP to reach its own data (A2A spec Appendix B, `a2a.txt:4127-4133`).

## 3. A2A in brief (what we would implement)
- **Agent Card** at `/.well-known/agent-card.json` (spec v1.0.0; the older
  `/.well-known/agent.json` path predates it) — identity, `supportedInterfaces[]`,
  `capabilities` (streaming, pushNotifications), `securitySchemes`, `skills[]`
  (`a2a.txt:1562-1760`, `:2712-2729`).
- **Task** lifecycle with states `SUBMITTED/WORKING/COMPLETED/FAILED/CANCELED/
  INPUT_REQUIRED/REJECTED/AUTH_REQUIRED` (`a2a.txt:1296-1317`).
- **Message / Part / Artifact**: a message carries parts (text|raw|url|data); results
  are Artifacts, not messages (`a2a.txt:1234-1244`, `:1366-1430`).
- Operations: `SendMessage`, `SendStreamingMessage` (SSE), `GetTask`, `ListTasks`,
  `CancelTask`, `SubscribeToTask`, push-notification config CRUD
  (`a2a.txt:607-724`, method map `:2084-2132`).
- Updates: polling, SSE streaming, or webhooks (at-least-once; clients dedupe)
  (`a2a.txt:1172-1211`, `:1529-1560`).

## 4. Proposed: exposing WAFINE as an A2A server
All **proposed**; the owner decides whether to build it. Sketch:
1. Serve `/.well-known/agent-card.json` from the BFF (Hono), on the same public edge
   that fronts `/mcp`.
2. Auth: reuse the OAuth 2.1 server already in the BFF — advertise it as an
   `oauth2SecurityScheme` (authorization-code + PKCE) or a `httpAuthSecurityScheme`
   `Bearer`. An A2A caller gets no scope beyond its key's `allowedSessions`
   (`docs/09-sessions-keys-mcp.md`).
3. **Map MCP tools to A2A skills 1:1.** The engine registers 51 tools (25 read, 26
   write; `OpenWA/docs/24-mcp-integration.md`). Each becomes an `AgentSkill` with
   `id`/`name`/`description`/`tags`; e.g. `MessageSendText` → skill `message-send-text`.
   The BFF already budgets the send tools (`gateway-proxy.ts:74-86`).
4. **Map a WAFINE task** to a user goal; a `MessageSend*` result becomes an `Artifact`
   (a `data` part carrying the provider message id). v1 advertises
   `capabilities.streaming=false`, `pushNotifications=false` — poll `GetTask`.
5. Reuse the API send budget (`docs/09-sessions-keys-mcp.md` gate 5) as in-task
   authorization, so an agent cannot exceed the human's limits.

This is additive: it introduces no new secret and no new inbound port (A2A rides the
existing Cloudflare Tunnel / OAuth surface). It is the natural home for the roadmap's
"later A2A" line.

## 5. Edge-host reachability (pending owner decision)
Exposing a public A2A endpoint runs into the same DNS question as the API host. The
BFF is only reachable through the Cloudflare Tunnel, so a tunnel hostname needs a
Cloudflare-managed zone. Two options, both open:
- **Option A** — move the zone's nameservers to Cloudflare, then manage the API/A2A
  hostname there.
- **Option B** — give the VM a public entry point (a Caddy reverse proxy) and point a
  plain DNS record at it.
Neither is asserted here; the owner and YG pick. Public hostnames in this repo are
always configured via env (`PUBLIC_API_URL`, `WEB_URL`, `SITE_URL`) — never hardcoded
(owner review rule, 2026-10-17). The separate testing-playground zone is **not**
production and must not be presented as such.

## 6. What the skills pack gives an agent
- `agentic-a2a-protocol` — the spec model + the proposed WAFINE mapping.
- `agentic-protocol-landscape` — A2A vs MCP vs (both) ACP vs ANP + how WAFINE uses MCP.
- `agentic-ipc-rpc` — unix sockets, FIFOs, JSON-RPC 2.0, gRPC, stdio framing,
  backpressure, idempotency, timeouts, retries (runnable examples).
- `agentic-sockets-streaming` — SSE, WebSocket, MCP Streamable HTTP, long polling,
  heartbeats, reconnect; **and the honest finding that the BFF streams nothing itself
  today** (it only passes an upstream SSE body through).
- `agentic-herdr-orchestration` — driving worker panes and the captain report format.

## 7. Open questions for the owner
1. Build A2A at all now, or keep MCP-only through the launch and revisit after?
2. If yes: JSON-RPC binding (matches MCP, one HTTP path) or REST binding (simpler
   clients)? gRPC is not a fit for the tunnel.
3. Auth: reuse the OAuth 2.1 server (one consent flow) or mint A2A-specific keys?
4. Skill granularity: 51 skills (1:1 with MCP tools) or a few coarse skills
   (`send-message`, `read-history`, `manage-labels`)?
5. Streaming: ship poll-only v1, or invest in SSE from the BFF (which does not
   stream today)?
6. Which task engines should WAFINE accept A2A requests from (the Zawia fleet, Claude,
   unknown public agents)? This bounds the auth and rate-limit design.

WAFINE, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA.
