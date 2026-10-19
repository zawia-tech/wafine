# Historical Plan: WAFINE BFF + White-Label Frontends

**NOTE:** This document is a historical plan and has been largely superseded by `docs/07-agentic-bff-plan.md` for current implementation details and architecture.

Supersedes the plan recovered from `opencode-session-ses_ee6f.md:5338`.
Inputs: `GROUNDING.md` (verified facts) + `research/R1–R6` (6 cited reports, 3,090 lines).

## 0. What changed from the original plan

The original plan was sound in architecture and wrong in three places. Each is now grounded:

| Original | Verified reality | Source |
|---|---|---|
| "Bun KV" for KEK cache + rate limit | **Fabricated.** `Bun.KV === undefined` on 1.4.2; likely Deno KV confusion | R4 §5, `GROUNDING.md` §2.1 |
| "no Tailwind" (§5.1) | Tailwind **is** implemented and already fused with CSS vars | R5 §6 |
| `app/` as submodule (directive) | **Never implemented**; 32 files tracked directly | `GROUNDING.md` §2.3 |
| 3 open decisions | **8** in the design doc | `GROUNDING.md` §3 |
| 60 msg/min rate limit | **Reckless as a default** — 2.4× above OpenWA's own alarm threshold | R6 §3 |
| AWS staging (§8.1, §9) | **Dropped by this plan's first draft.** Restored as Phase 7 + D11 | this file §4 |

## 1. Decisions resolved (evidence-backed)

| # | Decision | Verdict | Confidence | Basis |
|---|---|---|---|---|
| D1 | Adopt Better-T-Stack? | **No.** Borrow surgically: workspace-root shape, Better Auth session schema, `createAuth(env,db)` factory | 0.9 | R1: no hexagonal seam anywhere; refactor costs ≈ greenfield |
| D2 | `Bun KV` replacement | **In-process `Map`** (single VM) + **Postgres table** for durable state | 0.95 | R4 §5; scaffold already does this correctly |
| D3 | Rate-limit store | **Postgres token bucket + in-process cache.** Fail **closed** on outbound, **open** on inbound replies | 0.85 | R6 §5: Upstash free tier burns in <6 days at ceiling |
| D4 | Tenant isolation | **App predicates + least-privilege role `waas_bff`**; RLS enabled with **zero policies** as backstop | 0.9 | R3 §1: no Supabase JWT exists to carry a claim |
| D5 | Pooler | **Session pooler 5432**, not transaction 6543 | 0.95 | R3 §2: prepared statements + advisory locks + pipelining break |
| D6 | Frontend pattern | **Hostname rewrite in `middleware.ts`** → internal dynamic segment, one build | 0.9 | R5 §1; needs Next bump to ≥15.5 |
| D7 | BFF exposure | **Server-side proxy via Route Handlers**; design push as SSE, not WebSocket | 0.85 | R5 §3 |
| D8 | E2E naming | **Rename.** It is server-side envelope encryption with an optional client-side mode | 0.95 | R4 §6: §5.3 and §4.3 are mutually exclusive |
| D9 | `app/` submodule | **Drop it, record why** (see §6) | 0.7 | Submodule per-app fights the workspace; needs your call |
| D10 | WhatsApp ToS | **BLOCKER — escalate.** Prohibited on both paths without written consent | 0.8 | R6 §6, verbatim ToS |
| D11 | Staging environment | **Design says AWS (§8.1); recommend staging on OCI instead** — AWS staging skips the tunnel + Access path, so it validates less | 0.6 | R5 §7, doc §8.1 |

## 2. Data shapes first

Types before logic. Two of these fix real defects found in review.

```ts
type Brand<T, B> = T & { readonly __brand: B }
type Instant = string  // ISO-8601 UTC

type TenantId  = Brand<string, 'TenantId'>
type SessionId = Brand<string, 'SessionId'>
type MessageId = Brand<string, 'MessageId'>

// ── WrappedKey: the shape that was wrong ────────────────────────────────
// The design conflated DEK version with KEK version, so rotation could not
// select the right KEK. Both versions must travel with the ciphertext. (R4 §4)
type WrappedKey = {
  bytes: Uint8Array
  nonce: Uint8Array
  dekVersion: number    // version of the DEK being wrapped
  kekVersion: number    // version of the KEK doing the wrapping  ← WAS MISSING
  algId: 'xchacha20poly1305'
}

// AEAD associated data — closes the cross-tenant substitution attack. (R4 §1)
type Ad = { tenantId: TenantId; table: string; rowId: string; keyVersion: number }

// ── Session: multi-session, single-operator. Tenancy lives here. ────────
type SessionState =
  | { kind: 'created' }
  | { kind: 'qr'; qr: string; expiresAt: Instant }
  | { kind: 'authenticated'; since: Instant }
  | { kind: 'disconnected'; reason: string }
  | { kind: 'banned' }          // explicit: R6 says design for graceful account loss

type WaasSession = {
  id: SessionId
  tenantId: TenantId            // ALWAYS present — the isolation predicate
  openwaSessionId: string       // opaque, owned by OpenWA
  label: string
  phone: E164 | null
  state: SessionState
}
```

Every tenant-scoped table carries `tenant_id NOT NULL` **with an FK** — six of the
design's eight tables currently have no FK at all, so a bug can write rows for a
nonexistent tenant and nothing catches it (R3 §5).

## 3. Ports

```ts
MessagingGateway  // outbound: OpenWA HTTP. sendText, sendMedia, sessionLifecycle
TenantStore       // tenants, branding
SessionStore      // WaasSession
MessageStore      // ciphertext + wrapped keys
ObjectStorage     // R2, ciphertext only — never presign plaintext
RateLimiter       // token bucket; failClosed flag per operation class
Clock
```

`RateLimiter` carries the fail-open/fail-closed decision **as a parameter**, not as
a convention — inbound replies and outbound sends must not share a failure mode (R6 §5).

## 4. Phases — each independently verifiable

Riskiest unknowns first. Each phase ends in a check that can fail.

### Phase 0 — Blockers (human gate, runs in parallel)
- **Legal:** decide the WhatsApp ToS position (D10). This gates the business model, not the code.
- **`app/` submodule:** implement or drop (D9).
- **E2E naming:** approve the renamed guarantee (D8).
- *Exit:* three recorded decisions. Engineering proceeds meanwhile.

### Phase 1 — Repair the foundations (P0 defects)
Every item is a real bug found in review, all cheap:
1. Delete both "replace with Bun KV" comments; wire `Map` + Postgres (D2).
2. Export `zeroize` from `crypto.ts` — `enrollDevice` currently breaks (R4 §7).
3. Declare `argon2` in `package.json` — imported, never declared (R4 §7).
4. Replace `sodium.crypto_pwhash` (`crypto.ts:89`) — **sumo-build-only**, throws on default (R4 §1).
5. Add `kek_version` to wrapped-DEK rows (§2).
6. Fix the index: `(tenant_id, sent_at DESC, message_id DESC)` — current keyset pagination skips/repeats rows (R3 §5).
7. Unify the theme token: `white-label.ts:33` writes `--primary-color`, `tailwind.config.ts:13` reads `--color-primary`. Theme silently does not apply (R5 §6).
8. Zeroize expired KEK cache entries (currently dropped without wiping).
- *Exit:* `bun run check` green + a test per fix.

### Phase 2 — Workspace + core hexagon
- Add the missing workspace root; `app/core/{domain,ports}` pure, no I/O.
- In-memory adapters; vitest.
- *Exit:* `bun run check` green; core has zero imports from `adapters/`.

### Phase 3 — Outbound adapters
- `openwa-http`: base-URL allowlist, `X-API-Key`, **no credentials in URLs**.
- `postgres`: session pooler 5432 (D5), role `waas_bff` (D4).
- `r2-s3`: ciphertext only, opaque UUID keys.
- *Exit:* send-path smoke against the live gateway over tailnet.

### Phase 4 — Driving API + ingress
- REST for sessions/messages/branding; per-tenant guard.
- Webhook ingress: verify `X-OpenWA-Signature: sha256=<HMAC-SHA256(secret, rawBody)>`
  over **raw bytes**, constant-time, dedupe on `X-OpenWA-Idempotency-Key` (R2 §3).
- *Exit:* cross-tenant reads all 403/404; a replayed webhook is a no-op.

### Phase 5 — Frontend
- `middleware.ts` hostname rewrite (D6); server-side proxy (D7); SSE fan-out.
- White-label via one `--wl-*` token namespace, injected server-side (no branding flash).
- Zero-leakage gates: ESLint `no-restricted-imports` + post-build grep over `.next/static`
  + CSP `connect-src 'self'` (the previous wildcard `https:` was a hole; now enforced
    per-request in `app/web/src/middleware.ts`) (R5 §5).
- *Exit:* a tenant sees its own brand; grep proves no gateway URL in the bundle.

### Phase 6 — Infra wiring
- Compose service, arm64 images, `tailscale serve`, tunnel ingress. (The CF Access **Service Token** was dropped: `api.` has no Access app, decision 2026-10-14, runbook §8b.)
- `SEND_PACING_ENABLED=true` **by default** — shipping "normal users" with the anti-ban layer off is the wrong default (R6 §4).
- Migration pushed (**ask first**), backup covers `waas`, docs updated.
- *Exit:* end-to-end send + receive on staging.

### Phase 7 — Staging environment (was missing from this plan)
`docs/04-e2e-encryption.md` §8.1 specifies staging as **AWS** (ECS Fargate arm64 *or*
Lambda + API Gateway, separate staging Supabase project, separate R2 bucket), and §9
carries `[ ] Staging deployment (AWS)` as an unchecked box. At review (2026-10-09) nothing implemented it:

| Check | State at review |
|---|---|
| `terraform/` | `oci/` + `cloudflare/` only — **no AWS provider anywhere** (`terraform/aws/` was added later) |
| Task tracker | no AWS or staging entry at review |
| Kanban (6 boards) | no AWS staging card |
| AWS CLI | installed, but **session expired** — `aws sts get-caller-identity` fails |

**Recommendation: put staging on OCI, not AWS.** R5 §7 found that an AWS staging BFF with
no Cloudflare Tunnel never exercises the Access path, so the first real test of the
production ingress is production itself. Staging on OCI reuses `terraform/oci/`, keeps the
proxy boundary identical to prod (R5's own requirement), and removes an entire cloud
account from the critical path. If AWS staging is kept for a reason not visible in the
docs, it needs its own terraform module and a re-authenticated CLI.

- *Exit:* staging reachable, Access path exercised, `terraform plan` clean.

## 5. Non-goals

- No bulk/broadcast send — not a product decision, it is the ban vector (R6 §1).
- No order-preserving or deterministic encryption; blind indexes only on phone + JID (R4 §3).
- No confidential-compute enclave — Ampere A1 has no path (report §5).
- No presigned plaintext from R2, ever.

## 6. Open decisions carried forward

All 8 from `docs/04-e2e-encryption.md` §10 remain open or decided; the original plan
silently dropped 1–5. Notably **#3 (webhook shim point)** is now answered by Phase 4:
the BFF ingress is the shim, and it verifies before it decrypts.
**#1 (escrow)** interacts with R4's finding that recovery is currently incoherent —
the mnemonic wraps a URK that never wraps the tenant KEK, so passphrase loss is total
data loss despite a claimed recovery path. Fixing recovery is a prerequisite for shipping
any escrow answer.

## 7. Decision trail

- `GROUNDING.md` — verified facts, contradictions, `Bun.KV` disproof
- `research/R1–R6` — 3,090 lines, ~200 cited URLs, 38 explicit UNVERIFIED markers
- Live worker transcripts: `~/.hermes/cache/delegation/live/deleg_0cbc52de/`
