---
name: agentic-protocol-landscape
description: Choose between A2A, MCP, ACP and ANP, and see how WAFINE uses MCP today (BFF /mcp behind OAuth 2.1). Use when asked which agent protocol to use, the difference between A2A and MCP, what ACP or ANP are, how WAFINE exposes tools, or when deciding how a new agent should connect.
---

# Agentic protocol landscape

Four protocols show up when agents need to talk to something. Pick by *what is on
each end*: a model, an agent, or an app. WAFINE sits in this space already.

## The four, in one line each
- **MCP** (Model Context Protocol, Anthropic) - connects a model/agent to **tools,
  resources and prompts**. Agent-to-tool. https://modelcontextprotocol.io
- **A2A** (Agent2Agent, Linux Foundation) - peers: **agent-to-agent** discovery,
  tasks, streaming, push notifications. https://a2a-protocol.org/latest/specification
- **ACP** (Agent Communication Protocol, IBM; Linux Foundation) - REST-based
  **agent-to-agent** runs with sessions and an `Await` pause. Two "ACP"s exist;
  see the disambiguation below.
- **ANP** (Agent Network Protocol) - an experimental open protocol for an
  **open agent network** (agent discovery + identity); less standardised than the
  three above. Treat claims about ANP as evolving.

## They compose, not compete
A2A and ACP are agent-to-agent; MCP is agent-to-tool. In a real system the edges
differ: an A2A client asks an A2A server to do a task; that server uses MCP to reach
its own tools and data (`~/wafine/research/a2a.txt:4127-4133`). The ACP docs draw the
same picture: MCP stays *inside* one agent, ACP links agents
(`~/wafine/research/acp3.md:11-36`).

## When to use which
| Need | Use |
|---|---|
| Give one agent tools, files, DB, an API | **MCP** |
| Two opaque agents delegate a task, stream progress, resume | **A2A** |
| Same, but you want REST + runs/sessions + explicit `Await` | **ACP** |
| A public, federated agent marketplace/identity layer | **ANP** (experimental) |
| Drive a coding CLI from an editor/agent | **ACP** (Agent Client Protocol) - different ACP, see below |

## The ACP name collision (read this before citing "ACP")
Two unrelated protocols abbreviate to ACP:
1. **Agent Communication Protocol** - IBM, `agentcommunicationprotocol.dev`; REST,
   agent runs with states `created → in-progress → completed|failed|awaiting|cancelling`
   and an `Await` mechanism to pause for input (`~/wafine/research/acp4.md:17-87`).
2. **Agent Client Protocol** - editor↔coding-agent over JSON-RPC/stdio; the "acp"
   subcommand in `hermes acp` and `opencode acp`. `herdr agent start --kind` lists
   `hermes`, `opencode`, `claude`, `gemini` among the kinds it can launch, and each
   speaks its own client protocol. When the brief says "ACP (agent client protocol
   used by hermes acp / opencode acp)", it means this second one.

Always say which ACP you mean. When in doubt, spell it out.

## MCP, concretely: what WAFINE uses today
- The BFF proxies an MCP endpoint at **`/mcp`**, POST-only, stateless **Streamable
  HTTP** (`app/bff/src/adapters/http/routes/gateway-proxy.ts:298-303`). It forwards to
  the private OpenWA engine at `http://openwa-api:2785` (`gateway-proxy.ts:4-5`, base
  from `OPENWA_BASE_URL`).
- Auth is **OAuth 2.1** for connectors, or a minted API key: the BFF is an
  authorization server with `/.well-known/oauth-protected-resource`,
  `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize`,
  `/oauth/token`, `/oauth/revoke` (`app/bff/src/adapters/http/routes/oauth.ts:182-365`;
  flow in `docs/10-claude-connector.md`).
- Tools live in the engine, not the BFF: 51 tools (25 read, 26 write). The BFF only
  recognises the send tools it must budget: `MessageSendText`, `MessageSendImage`,
  `MessageSendVideo`, `MessageSendAudio`, `MessageSendDocument`, `MessageSendLocation`,
  `MessageSendContact`, `MessageSendSticker`, `MessageSendTemplate`, `MessageReply`,
  `MessageForward` (`gateway-proxy.ts:74-86`; catalogue `OpenWA/docs/24-mcp-integration.md`).
- The BFF is also an MCP **client**: it holds a 12-server registry with `stdio` and
  Streamable-HTTP transports (`app/bff/src/infrastructure/mcp/server-registry.ts`,
  `mcp-client-factory.ts`; plan `docs/07-agentic-bff-plan.md` §5.2).
- `MCP_READONLY` gates write-tier tools (`docs/09-sessions-keys-mcp.md`).

## Rule of thumb for WAFINE work
- Talking to the WhatsApp engine from an app or agent → **MCP** (already there).
- Letting an external agent hand WAFINE a goal and watch it complete → **A2A**
  (proposed only; see `skills/agentic-a2a-protocol` and `docs/13-agentic-protocols.md`).
- Driving a local coding CLI from the editor → **Agent Client Protocol** (the second ACP).
- Vocabulary overlaps; if a doc says "ACP", confirm which one before acting.

## References
- `~/wafine/research/a2a.txt` (Appendix B, `:4127-4133`), `~/wafine/research/acp.txt`,
  `acp3.md`, `acp4.md`, `~/wafine/research/mcp-transports.md`
- https://modelcontextprotocol.io, https://a2a-protocol.org/latest/specification,
  https://agentcommunicationprotocol.dev
- `docs/09-sessions-keys-mcp.md`, `docs/10-claude-connector.md`, `docs/07-agentic-bff-plan.md`
