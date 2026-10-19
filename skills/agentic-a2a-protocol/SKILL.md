---
name: agentic-a2a-protocol
description: Understand and use the Agent2Agent (A2A) protocol - agent cards, tasks, messages, parts, artifacts, task states, SSE streaming, push notifications, auth - and how WAFINE could expose an A2A agent card mapping its MCP tools to skills. Use when asked about A2A, agent cards, .well-known/agent-card.json, agent-to-agent tasks, task states, or exposing an agent endpoint.
---

# Agent2Agent (A2A) protocol

A2A is an open standard for communication between independent, often opaque agents
(Linux Foundation; spec v1.0.0, https://a2a-protocol.org/latest/specification).
It is the *agent-to-agent* peer, complementing MCP (agent-to-tool). Local colour:
WAFINE already runs MCP in the BFF (`docs/09-sessions-keys-mcp.md`,
`docs/10-claude-connector.md`) and a local A2A wrapper
(`a2a-opencode` around `opencode serve`) already runs on the operator workstation.

Primary source for this skill: `~/wafine/research/a2a.txt` (a text extract of the
spec). Cite line anchors below when you need to re-check.

## Core model (`a2a.txt:592-604`, `:1247-1430`)
- **Agent Card** - JSON metadata document describing identity, skills, capabilities,
  service endpoint and auth requirements.
- **Message** - one communication turn, role `ROLE_USER` or `ROLE_AGENT`, carrying
  one or more `Part`s (`:1318-1355`).
- **Task** - the stateful unit of work, unique id, current `status`, optional
  `artifacts` and `history` (`:1248-1277`).
- **Part** - the content unit; **exactly one** of `text` | `raw` (base64) | `url` |
  `data` (arbitrary JSON), plus optional `filename`/`mediaType` (`:1366-1400`).
- **Artifact** - a task output (document, image, structured data), made of `Part`s;
  results go in artifacts, *not* in messages (`:1234-1244`, `:1401-1430`).
- **Context** - optional id grouping related tasks/messages (multi-turn).

## Task states (`a2a.txt:1296-1317`)
`TASK_STATE_UNSPECIFIED`, `SUBMITTED`, `WORKING`, `COMPLETED` (terminal),
`FAILED` (terminal), `CANCELED` (terminal), `INPUT_REQUIRED` (interrupted),
`REJECTED` (terminal), `AUTH_REQUIRED` (interrupted).

## Core operations (`a2a.txt:607-724`, method map `:2084-2132`)
| Function | JSON-RPC | gRPC | REST |
|---|---|---|---|
| Send message | `SendMessage` | `SendMessage` | `POST /message:send` |
| Send streaming message | `SendStreamingMessage` | `SendStreamingMessage` | `POST /message:stream` |
| Get task | `GetTask` | `GetTask` | `GET /tasks/{id}` |
| List tasks | `ListTasks` | `ListTasks` | `GET /tasks` |
| Cancel task | `CancelTask` | `CancelTask` | `POST /tasks/{id}:cancel` |
| Subscribe to task | `SubscribeToTask` | `SubscribeToTask` | `POST /tasks/{id}:subscribe` |
| Push config CRUD | `*TaskPushNotificationConfig` | same | `/tasks/{id}/pushNotificationConfigs` |
| Extended agent card | `GetExtendedAgentCard` | same | `GET /extendedAgentCard` |

Bindings are functionally equivalent (`:2084`). JSON-RPC is over HTTP(S) with
SSE streaming and PascalCase methods (`:2922-2947`); REST uses `application/a2a+json`
(`:3629`). Errors map to JSON-RPC codes -32001..-32006 and HTTP statuses (`:2133-2163`).

## Discovery: the agent card (`a2a.txt:2712-2729`, `:1562-1760`)
- Fetched at **`/.well-known/agent-card.json`** (`:2714`, IANA registration `:3960-3965`).
  Note: this skill's tasking said `/.well-known/agent.json`; that was the older A2A
  path. In spec v1.0.0 the suffix is **`agent-card.json`**. Support the legacy path
  only as a redirect if you must interoperate with pre-1.0 clients.
- Key fields: `name`, `description`, `supportedInterfaces[]`
  (`url`,`protocolBinding` ∈ JSONRPC|GRPC|HTTP+JSON,`protocolVersion`), `provider`,
  `version`, `capabilities` (`streaming`, `pushNotifications`, `extendedAgentCard`),
  `securitySchemes` + `securityRequirements`, `defaultInputModes`/`defaultOutputModes`,
  `skills[]`, optional `signatures` (JWS/`RFC 7515`) and `iconUrl`.
- `AgentSkill`: `id`, `name`, `description`, `tags[]`, optional `examples`,
  `inputModes`/`outputModes` (`:1682-1719`).
- Cards MAY be JWS-signed; canonicalization is JCS `RFC 8785` (`:2730-2741`).
- Serve with `Cache-Control` + `ETag`; clients use conditional requests (`:2912-2921`).
- Sample card: `a2a.txt:2840-2911`.

## Streaming and async updates (`a2a.txt:1172-1211`)
Three mechanisms: polling (`GetTask`), SSE streaming (`SendStreamingMessage`,
`SubscribeToTask`; needs `capabilities.streaming`), and push notifications
(HTTP POST webhooks to a client-registered URL; needs `capabilities.pushNotifications`).
Webhook payload is a `StreamResponse` (`task`|`message`|`statusUpdate`|`artifactUpdate`)
with `Content-Type: application/a2a+json`; deliver at least once, clients process
idempotently (`:1529-1560`). Events must keep generation order (`:1196-1198`).

## Auth (`a2a.txt:1760-1892`, security section `:7`)
`securitySchemes` is a discriminated union of `apiKeySecurityScheme`,
`httpAuthSecurityScheme` (e.g. `Bearer`), `oauth2SecurityScheme` (flows:
`authorizationCode`+PKCE, `clientCredentials`, `deviceCode`), `openIdConnectSecurityScheme`,
`mtlsSecurityScheme`. `securityRequirements` reference schemes by name. In-task
authorization (let an agent act on the user's behalf mid-task) is a defined extension
point (spec §7.6).

## Proposed: WAFINE as an A2A server (design, not shipped)
This is a **proposal**; nothing below is implemented. Mark every piece as proposed
in any doc or PR.
- Expose `/.well-known/agent-card.json` from the BFF (Hono) behind the same
  Cloudflare Tunnel + OAuth 2.1 surface that fronts `/mcp`
  (`docs/10-claude-connector.md`). Auth: reuse the OAuth scheme as
  `oauth2SecurityScheme` or a `httpAuthSecurityScheme` `Bearer`.
- Map each MCP tool the engine already exposes (51 tools, `OpenWA/docs/24-mcp-integration.md`)
  to one `AgentSkill`: e.g. `id: "message-send-text"` from `MessageSendText`,
  `tags` from the WhatsApp domain, `examples` from the tool's prompt text.
- Map REST/MCP calls onto A2A operations: a WAFINE task = a user goal; a
  `MessageSend*` outcome = an `Artifact` (status + provider message id as `data` part).
  Set `capabilities` = `{streaming: false, pushNotifications: false}` in v1.
- Reuse the send budget and per-key scoping (`docs/09-sessions-keys-mcp.md`) as
  in-task authorization - an A2A caller never gets a broader scope than its key.
- The public endpoint faces the same pending DNS decision as the API host
  (nameservers to a Cloudflare-managed zone, or a public Caddy entry point on the
  VM); do not assert a resolver in docs - present both options.

## Gotchas
- Messages are not reliable delivery; do not use them for critical outputs (`:1243`).
- A task in a terminal state rejects further messages (`:621`).
- Streaming needs the capability flag; capability validation happens before execution.
- One `Part` carries exactly one of text/raw/url/data (`:1400`).

## References
- `~/wafine/research/a2a.txt` (spec extract, v1.0.0)
- https://a2a-protocol.org/latest/specification
- https://modelcontextprotocol.io (MCP, the complementary agent-to-tool protocol)
- `docs/09-sessions-keys-mcp.md`, `docs/10-claude-connector.md`, `docs/13-agentic-protocols.md`
