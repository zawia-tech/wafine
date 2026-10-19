# 07 — Agentic BFF Implementation Plan

**Task:** `t_wa_bff_002` · ARD `ard/ARD.md` §3.2, §7, §8 · Date: 2026-10-09
**Owner:** OpenCode (w1D:p6) · **Status:** Scaffolded in `app/bff/src`; deployed on the VM beside the engine, loopback-only (`stack/compose.infra.yml`, `docs/02-architecture.md` "Services on the VM")
**Inputs:** `ard/ARD.md`, `docs/04-e2e-encryption.md`, `docs/05-bff-frontend-plan.md`,
the OpenWA HTTP + MCP surface (`OpenWA/docs/06-api-specification.md`, `OpenWA/docs/24-mcp-integration.md`), the 2026-10-09 design reviews, existing `app/bff/src`.

---

## 1. Goal

Turn the existing WaaSel BFF (hexagonal, E2E envelope encryption) into the **agentic core** the
ARD specifies: an OpenWA REST client, an MCP client factory for 10+ servers, a markdown skills
engine, a Redis/BullMQ workflow queue, and dependency-aware health endpoints — without breaking
the crypto/storage/auth layers already in place.

The BFF is the **sole orchestration boundary** between WhatsApp traffic (via OpenWA) and external
agent tooling (MCP servers, LLM runtime).

---

## 2. What already exists (do not rebuild)

`app/bff/src` is a functioning hexagonal BFF, not an empty scaffold:

| Layer | Existing | Reuse decision |
|-------|----------|----------------|
| Runtime | Bun 1.4.2 + TypeScript (strict, `noUncheckedIndexedAccess`) | **Keep** |
| HTTP | Hono 4 + `@orpc/*` + `@hono/zod-validator` | **Keep**; add routers into `createApp()` |
| Domain ports | `src/domain/ports/index.ts` (crypto, storage, auth, entities) | **Extend** with agentic ports |
| Domain services | `src/domain/services/index.ts` (encryption, KMS, blind index) | **Keep** |
| Infra | `xchacha20`, `blind-index`, `argon2id`, `r2-client`, `rate-limit` | **Keep** |
| Adapters | `http/app.ts`, `cache/in-memory-session-cache.ts` | **Keep**; add routes/adapters |
| Config | `src/config/env.ts` | **Extend** (new agentic env vars) |
| DI | manual, in `src/index.ts` | **Extend** (wire new services) |
| DB | Drizzle + `drizzle/0000_*` (encryption tables) | **Keep**; agentic tables are Phase 3 |
| Tests | `bun:test`, `*.test.ts` colocated | **Follow** |

Established conventions to mimic: one file per concern, `.js` import specifiers, a one-line
JSDoc header per file, ports as interfaces in `domain/ports`, implementations in
`infrastructure/<concern>/`, driving adapters in `adapters/`, no framework DI container.

---

## 3. ARD ↔ repo path reconciliation

The ARD §7 lists flat paths (`src/clients/openwa.ts`, `src/skills/`, …). The repo already uses a
hexagonal layout (`domain/ → infrastructure/ → adapters/`). Per `docs/05-bff-frontend-plan.md` §3
("Ports … core has zero imports from `adapters/`") we honor the hexagon and map the ARD subtasks:

| ARD subtask | ARD path | Repo path (this plan) | Layer |
|-------------|----------|------------------------|-------|
| OpenWA client | `src/clients/openwa.ts` | `src/domain/ports/gateway.ts` + `src/infrastructure/gateway/openwa-http-client.ts` | port + adapter |
| MCP client factory | `src/clients/mcp.ts` | `src/domain/ports/mcp.ts` + `src/infrastructure/mcp/{mcp-client-factory,server-registry}.ts` | port + adapter |
| Skills engine | `src/skills/` | `src/domain/ports/skills.ts` + `src/adapters/skills/{markdown-skill-loader,skill-engine}.ts` | port + adapter |
| Redis queue | `src/queue/` | `src/domain/ports/queue.ts` + `src/infrastructure/queue/{bullmq-queue,in-memory-queue}.ts` | port + adapter |
| Health endpoint | `src/routes/health.ts` | `src/adapters/http/routes/health.ts` + `src/infrastructure/health/health-aggregator.ts` | driving adapter |

This keeps the dependency rule intact: **domain ports import nothing from infrastructure**; every
external SDK (`@modelcontextprotocol/sdk`, `bullmq`, `ioredis`) is only reached from an adapter.

---

## 4. Target architecture

```
                      ┌───────────────────────────────────────────────┐
  POST /webhook/openwa │  adapters/http  (Hono)                        │
  ───────────────────► │  ├── routes/health.ts      → IHealthProbe[]   │
                       │  ├── routes/webhook.ts     → verify + enqueue │
                       │  └── routes/agent.ts       → skills.run       │
                       └───────────────┬───────────────────────────────┘
                                       │ (ports)
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  IWhatsAppGateway             ISkillEngine                    IJobQueue
  (OpenWA REST)                (markdown skills)               (BullMQ)
        │                              │                              │
        ▼                              ▼                              ▼
  infrastructure/gateway       adapters/skills              infrastructure/queue
  openwa-http-client           markdown-skill-loader         bullmq-queue
  + webhook HMAC verifier      skill-engine / matcher        in-memory-queue (fallback)
        │                              │
        │                              ▼
        │                       IMcpClientFactory  →  12-server registry
        └──────────────────────►  infrastructure/mcp/mcp-client-factory
```

**Dependency rule:** `domain` ← `infrastructure` ← `adapters` ← `index.ts` (DI). No upward imports.

---

## 5. Component specifications

### 5.1 OpenWA API client (`IWhatsAppGateway`)

Wire contract verified against the OpenWA v0.24.0 source and `OpenWA/docs/06-api-specification.md`:

- Base path `/api`, auth `X-API-Key: owa_k1_<hex>` (or `Authorization: Bearer`), content JSON.
- Sessions: `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/qr`.
- Send: `POST /api/sessions/:id/messages/send-text` `{chatId,text,mentions?}` → `201 {messageId,timestamp}`.
- Media: `POST .../send-{image|video|audio|document|sticker}` (`url` xor `base64`, `mimetype` with base64, `caption?`).
- Health: `GET /api/health` (public).

Behavior: `fetch` with `AbortController` timeout; typed `OpenWaApiError {status, code, body}`;
**no credentials in URLs**; base URL from `OPENWA_BASE_URL`; never log the API key.

**Ingress** (`IWebhookVerifier`): `X-OpenWA-Signature: sha256=<hex>` = HMAC-SHA256(secret, **raw body**).
Verify with `node:crypto` `timingSafeEqual` (length-check first), `401` on mismatch, dedupe on
`X-OpenWA-Idempotency-Key`, then parse JSON. Envelope:
`{event, timestamp, sessionId, idempotencyKey, deliveryId, data}`.

**Acceptance:** list/create/get session + `sendText` succeed against the live gateway over tailnet;
tampered body → `401`; replayed idempotency key → no-op.

### 5.2 MCP client factory (`IMcpClientFactory`) — 12 servers

Lazy connection per server; clients cached; one SDK `Client` per server. Transports:
`stdio` (`StdioClientTransport {command,args,env}`) and `http` (`StreamableHTTPClientTransport`
→ ARD's stateless Streamable-HTTP, `Accept: application/json, text/event-stream`).

Registry (`server-registry.ts`), from ARD §3.2 + `~/.config/opencode/opencode.json`:

| id | transport | endpoint / command | read-only | notes |
|----|-----------|--------------------|-----------|-------|
| `supabase` | http | MCP connector URL | yes | needs `SUPABASE_ACCESS_TOKEN` |
| `vercel` | http | Vercel MCP | yes | `VERCEL_TOKEN` |
| `cloudflare` | http | Cloudflare MCP | yes | `CLOUDFLARE_API_TOKEN` |
| `context7` | http | `https://mcp.context7.com/mcp` | yes | docs lookup |
| `deepwiki` | http | DeepWiki MCP | yes | repo Q&A |
| `serena` | stdio | `uvx --from serena-agent serena start-mcp-server` | no | local |
| `beatapi` | http | `https://beatapi.io/mcp` | yes | `BEATAPI_API_KEY` |
| `railway` | stdio | `railway mcp` | no | local CLI |
| `laya` | stdio | `laya-mcp-bridge` | no | local |
| `openviking` | stdio | `mcp-proxy.mjs` | no | memory |
| `headroom` | stdio | `headroom mcp serve` | yes | local |
| `openwa` | http | `OPENWA_MCP_URL` | yes (forces `MCP_READONLY=true`) | the gateway's own MCP at `/mcp` |

`enabled` flags gate connection; `required` marks servers that block readiness. `MCP_READONLY`
(default true) means the factory refuses to expose write-tier OpenWA tools unless explicitly off.

**Acceptance:** `health()` pings each enabled server; `getClient(id).listTools()` returns the
catalog; a disabled/absent server does not fail boot.

### 5.3 Skills engine (`ISkillRegistry` + `ISkillEngine`)

Loads markdown skills from `SKILLS_DIRS` (default `./skills` + `.claude/skills`, `.opencode/skills`
when present). A skill is a `SKILL.md` (or `*.md`) with YAML frontmatter:

```md
---
name: pr-review
description: Review a pull request and post findings
triggers: [pr review, pull request, review pr]
tools: [github.create_pr_review, context7.search]
---
<body — instructions for the runtime>
```

- `MarkdownSkillLoader` scans dirs, parses frontmatter (dependency-free parser), never throws on a
  malformed skill (skips + records a warning).
- `SkillRegistry.match(input)` = deterministic token/keyword scoring over `name + triggers +
  description`; optional LLM re-rank is Phase 2.
- `SkillEngine.run(name, input, ctx)` resolves the skill, assembles an execution plan from
  `tools` (resolved through `IMcpClientFactory`), and dispatches. LLM-backed execution is a
  **Phase 2** deliverable behind `ILlmClient` (not yet implemented; `run` returns a typed
  `{ok:false, output:'not-implemented'}` stub so the route is exercisable now).

**Acceptance:** a fixture skill matches "review this PR"; the registry lists loaded skills; a
malformed skill is skipped without crashing boot.

### 5.4 Redis/BullMQ queue (`IJobQueue`)

- `BullMqJobQueue` wraps `bullmq` `Queue` + `Worker` on an `ioredis` connection from `REDIS_URL`,
  prefix `QUEUE_PREFIX`, concurrency `QUEUE_CONCURRENCY`.
- `InMemoryJobQueue` is the fallback when `REDIS_URL` is unset (local dev, hackathon), so the BFF
  always boots.
- Job names: `agent.run`, `webhook.deliver`, `message.send`. `enqueue` returns `{id,name}`;
  `register(name, handler)` binds a processor; `counts()` for health.

**Infra:** the VM stack now runs Valkey — `stack/compose.infra.yml` activates the upstream `redis`
service (`valkey/valkey:8-alpine`, `--maxmemory 1gb --maxmemory-policy noeviction`, because BullMQ
job state must never be evicted) and wires `REDIS_URL` into the BFF. Setup + key handling:
`stack/gateway-key.sh` (usage in its header) and `docs/02-architecture.md` "Services on the VM".

**Acceptance:** with `REDIS_URL` set, enqueue → worker executes → `counts().completed` increments;
without it, the in-memory queue does the same in-process.

### 5.5 Health endpoints (`IHealthProbe` + `/health`)

ARD §8 requires `/health` → `{ok: true, deps: {...}}`. Implement:

- `GET /health` — liveness, always `200 {ok:true}` (existing, kept).
- `GET /health/ready` — aggregates probes: `openwa`, `queue`, `mcp`, `skills`, `db`
  (when configured). Each probe is timeout-bounded (`HEALTH_TIMEOUT_MS`) and returns
  `{name,status,latencyMs,detail?}`. Overall `ok` = no `required` dependency `down`; `200`/`503`.

**Acceptance:** `/health` fast and dependency-free; `/health/ready` reports per-dependency status and
returns `503` when a required dep is down.

---

## 6. Data flow (ARD §4, corrected)

```
WhatsApp ─▶ OpenWA ─▶ webhook POST /webhook/openwa (HMAC verified, deduped)
   └─▶ enqueue agent.run {tenantId, sessionId, chatId, text}
        └─▶ worker: SkillRegistry.match(text) ─▶ SkillEngine.run
             └─▶ IMcpClientFactory.getClient(id).callTool(...)  (read-only by default)
                  └─▶ result ─▶ IWhatsAppGateway.sendText(...) ─▶ WhatsApp reply
```

Note (ARD inaccuracy): OpenWA's internal port is **2785**, not 3000. Redis/Valkey now runs in the
stack (§5.4); the ARD's "Redis not in the stack" note is stale.

---

## 7. Environment variables (new)

Add to `src/config/env.ts` and `stack/.env.example`:

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `4000` (ARD) | BFF listen port |
| `OPENWA_BASE_URL` | `http://localhost:2785` | gateway REST base (exists) |
| `OPENWA_API_KEY` | — | gateway key (exists) |
| `OPENWA_WEBHOOK_SECRET` | — | HMAC secret for ingress |
| `REDIS_URL` | — | enables BullMQ; unset → in-memory queue |
| `QUEUE_PREFIX` | `openwa` | BullMQ key prefix |
| `QUEUE_CONCURRENCY` | `2` | worker concurrency (2 OCPU budget) |
| `SKILLS_DIRS` | `./skills,.claude/skills,.opencode/skills` | skill search path |
| `MCP_READONLY` | `true` | refuse write-tier MCP tools |
| `MCP_SERVERS` | — | optional JSON override of the registry |
| `HEALTH_TIMEOUT_MS` | `2000` | per-probe timeout |

Secrets never logged; `.env` stays VM-only (repo rule, `CONTRIBUTING.md`).

---

## 8. Phased delivery (each phase ends in a verifiable check)

- **P0 — Scaffold (this change).** Ports, adapters, registry, loader, in-memory queue, health
  router, env + deps. *Exit:* `bun run typecheck` + `bun run lint` + `bun test` green.
- **P1 — OpenWA live wire.** Point `OPENWA_BASE_URL` at the tailnet host; verify list/create/send;
  register a webhook; assert HMAC verify + dedupe. *Exit:* smoke send + replay no-op.
- **P2 — Redis service + BullMQ.** Done: Valkey runs in the VM stack (`openwa-redis`), and the queue uses
  `BullMqJobQueue` when `REDIS_URL` is set. Still to do: process `agent.run` end-to-end. *Exit:* enqueue → worker → reply.
- **P3 — MCP bring-up.** Enable read-tier servers one at a time; `/health/ready` shows each.
  *Exit:* `listTools` succeeds for the enabled set; boot never blocks on a dead server.
- **P4 — Skills + LLM.** Implement `ILlmClient` (provider TBD), tool-calling loop, skill match
  re-rank. *Exit:* "review this PR" produces a real MCP-backed action.
- **P5 — Agentic tables (Drizzle).** `agent_runs`, `skills_catalog`, `mcp_registry` if persisted;
  new migration only (never edit applied migrations). *Exit:* run history queryable.

---

## 9. Risks & open questions

| # | Risk | Mitigation |
|---|------|------------|
| R1 | ~~**Redis absent from the stack**~~ — Valkey now runs in the stack (§5.4) | `REDIS_URL` is set by `stack/compose.infra.yml`; `InMemoryJobQueue` fallback when unset |
| R2 | A1 is **2 OCPU / 12 GB**; OpenWA already capped at 8 GB | Cap BullMQ concurrency + Redis `maxmemory`; do not co-locate heavy MCP servers |
| R3 | MCP servers as stdio child processes share the container PID/memory | Keep stdio MCP servers opt-in; prefer remote/HTTP; document per-server budget |
| R4 | `MCP_READONLY` must stay `true` publicly; Cloudflare 404s `/mcp` | Factory refuses write-tier unless `MCP_READONLY=false`; never expose `/mcp` |
| R5 | Skill markdown is untrusted content (prompt injection) | Treat skill bodies as data; no tool call without explicit allow-list in `tools` |
| R6 | Webhook secret + OpenWA key are credentials | env-only, mode 600, never echoed; constant-time compare |
| R7 | ~~ARD says BFF `:4000` but no compose service exists yet~~ — `bff` is in `stack/compose.infra.yml` (loopback-only) | `stack/compose.infra.yml` |
| R8 | `@modelcontextprotocol/sdk` / `bullmq` API drift | Adapters isolate SDK surface; typecheck in CI |

Open questions for the operator: which LLM/runtime backs `ILlmClient`? Are any stdio MCP servers
required on the VM, or remote-only?
