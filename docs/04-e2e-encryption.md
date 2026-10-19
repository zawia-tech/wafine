# 04 — E2E Encryption Architecture (WAFINE BFF + Frontend)

**Status:** Phase 0 — design, not yet implemented
**Date:** 2026-10-08
**Supersedes:** nothing (new document)
**Related:** `docs/02-architecture.md` (system context), `e2e-encryption-report.md` (research artifact)

---

## 1. Scope & goals

Add a **BFF (Backend-for-Frontend)** and **white-labeled Next.js frontend** to the existing OpenWA-on-OCI infrastructure. The BFF is the sole encryption/decryption boundary: it stores **only ciphertext** in Supabase and **only ciphertext** in R2, and holds plaintext **only in RAM** during a request.

**Non-goals:**
- Modifying the OpenWA submodule in any way
- Replacing OpenWA's own Postgres datastore (it stays as the gateway's internal store)
- Client-side-only encryption (server-side blind encryption is the default; client-side is opt-in per tenant)
- Bulk send / broadcast messaging

**The honest guarantee:** *Supabase, OCI, and Cloudflare cannot read tenant message content, contacts, or media. The BFF can, transiently, in order to run automation — here is exactly when and for how long.*

---

## 2. System context

```
                          ┌─────────────────────────────────────────────┐
                          │              White-labeled Next.js            │
                          │              (Vercel, app/web)               │
                          │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
                          │  │ React   │  │ Client   │  │ White-label│  │
                          │  │ Server  │  │ crypto   │  │ theme      │  │
                          │  │ Comp.   │  │ (XChaCha)│  │ (CSS vars) │  │
                          │  └────┬────┘  └────┬─────┘  └────────────┘  │
                          └───────┼─────────────┼───────────────────────┘
                                  │ HTTPS       │ HTTPS
                                  ▼             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          BFF (Hono + oRPC + Bun)                              │
│                          app/bff — hexagonal                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Auth     │ │ Rate     │ │ Cache    │ │ Crypto   │ │ Storage adapter   │  │
│  │ middleware│ │ limit    │ │ (Bun KV) │ │ service  │ │ (R2 ciphertext)   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────────┬─────────┘  │
│       └─────────────┴─────────────┴─────────────┴────────────────┘            │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  Domain layer: entities, ports, key management, encryption           │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │  Application layer: use cases (send, receive, search, rotate)        │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │  Infrastructure layer: Drizzle + Supabase, R2, auth proxy, cache     │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ TLS (Supabase pooler)
                                 ▼
                    ┌────────────────────────────┐
                    │  Supabase Postgres          │
                    │  (ciphertext + blind idx)  │
                    └────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐           ┌───────▼───────┐
              │ Cloudflare │           │  OpenWA gateway│
              │ R2         │           │  (OCI A1)      │
              │ (ciphertext│           │  port 2785     │
              │  media)    │           │  X-API-Key     │
              └───────────┘           └────────────────┘
```

**Deployment:**
- **Staging:** AWS (ECS Fargate or Lambda + API Gateway) — isolated from production OCI
- **Production:** OCI Ampere A1 VM (same as OpenWA) or AWS — TBD after staging validation
- **Frontend:** Vercel (white-labeled, custom domain per tenant)

---

## 3. Key hierarchy & crypto design

### 3.1 Three-level envelope

```
URK (User Root Key)  — 32 random bytes, never leaves device
  │  wrapped by: Argon2id(passphrase) + device_secret  (1Password pattern)
  │
  └─ Tenant KEK — 32 random bytes, per tenant
       │  stored wrapped per-device in tenant_keys
       │
       ├─ CK (message content key)  — per-message random 32B
       ├─ IK (identity key)         — per-column blind-index key
       ├─ MK (media key)            — per-object random 32B
       └─ SK (search key)           — reserved
```

**WK is random, not derived** — passphrase change is a cheap re-wrap, not a full re-encrypt.

### 3.2 AEAD: XChaCha20-Poly1305

- **Record payloads:** `crypto_aead_xchacha20poly1305_ietf` (libsodium)
- **Media streaming:** `crypto_secretstream_xchacha20poly1305` (64 KiB chunks)
- **Key wrapping:** AES-256-KW (RFC 3394) or XChaCha20-Poly1305 with random nonce
- **AAD binding:** `tenant_id || table || row_id || key_version || schema_version` — non-negotiable

### 3.3 Blind indexes

```
blind_index = HMAC-SHA256(HKDF(IK, "idx/<col>/v1"), normalize(value))[:16]
```

- Per-tenant `blind_index_key` (wrapped by tenant KEK)
- Only phone numbers (E.164) and chat JIDs are indexed
- No server-side FTS, no OPE, no deterministic encryption of payloads

### 3.4 Recovery

- **Default:** generated 256-bit recovery mnemonic (BIP39-style) wrapping the URK
- **Enterprise opt-in:** Shamir secret sharing (k-of-n)
- **Hard mode:** no recovery (data loss is a feature) — enterprise only

### 3.5 Rotation

- Idempotent, resumable, dual-version-tolerant
- Write-new → verify → retire-old after 7-day soak
- `key_rotation_jobs` table tracks cursor position
- Decryption tries `key_version` first, falls back to `key_version - 1`

---

## 4. BFF architecture (hexagonal)

### 4.1 Layers

```
app/bff/src/
  domain/            # Pure business logic, zero I/O
    entities/        # Message, Contact, Tenant, Device, RecoveryKey
    ports/           # Interfaces: IMessageRepository, ICryptoService, IKeyService, IStorageAdapter
    services/        # EncryptionService, KeyManagementService, BlindIndexService
    value-objects/   # EncryptedPayload, WrappedKey, KeyVersion

  application/       # Use cases, orchestration
    usecases/        # SendMessage, ReceiveMessage, SearchContacts, RotateKey, EnrollDevice
    dto/             # Request/response DTOs with validation
    mappers/         # Entity ↔ DTO mapping

  infrastructure/    # Adapters, external services
    db/              # Drizzle schema, migrations, repository implementations
      schema/        # Drizzle table definitions
      migrations/    # SQL migrations
      repositories/  # IMessageRepository impl, etc.
    crypto/          # XChaCha20-Poly1305, secretstream, blind index, Argon2id
      xchacha20.ts
      secretstream.ts
      blind-index.ts
      argon2id.ts
    auth/            # Custom auth: middleware, proxy, web-workers, cache, rate-limit
      middleware.ts  # Hono middleware: session validation, key unwrapping
      proxy.ts       # Auth proxy for upstream OpenWA
      web-workers.ts # Web Crypto workers for client-side key operations
      cache.ts       # Session/key cache (Bun KV or in-memory)
      rate-limit.ts  # Token-bucket rate limiter
    storage/         # R2 ciphertext storage adapter
      r2-client.ts
      presigned.ts   # Ciphertext-only presigned URLs
    config/          # Env validation, feature flags

  adapters/          # HTTP interface
    http/
      app.ts         # Hono app assembly
      routers/       # oRPC routers: messages, contacts, tenants, health
      middleware/    # Auth, rate-limit, error-handler, request-logger
    rpc/             # oRPC client (for frontend consumption)

  index.ts           # Entry point: Bun.serve with Hono
```

### 4.2 Request flow

```
Client → HTTPS → BFF (Hono)
  1. Auth middleware: validate session/JWT, unwrap tenant KEK (short-TTL)
  2. Rate-limit middleware: token-bucket per tenant+endpoint
  3. Cache middleware: check Bun KV for decrypted response cache
  4. oRPC router → use case
  5. Use case:
     a. Unwrap DEK (if needed)
     b. Decrypt/encrypt via domain service
     c. Call infrastructure port (DB, R2)
     d. Map entity → DTO
  6. Response middleware: encrypt sensitive fields, set cache headers
  7. Audit log: unwrap event (who, what, when, TTL)
```

### 4.3 Auth design (custom, not Supabase Auth)

The BFF uses **custom auth** — not Supabase Auth — because:
- We need per-tenant key unwrapping tied to auth sessions
- We need fine-grained scope control (field-level, time-windowed)
- We need audit logging of every unwrap event

**Components:**
- **Middleware:** validates JWT/session, extracts tenant context, unwraps KEK
- **Proxy:** forwards authenticated requests to OpenWA with scoped API keys
- **Web-workers:** client-side key derivation (Argon2id) and wrapping/unwrapping
- **Cache:** short-TTL KEK cache (Bun KV, 5-min TTL, zeroized on eviction)
- **Rate-limit:** token-bucket per tenant+endpoint, Redis-backed (or Bun KV for single-node)

**Session flow:**
1. Client derives KEK from passphrase + device_secret (Web Crypto / libsodium.js)
2. Client sends KEK-wrapped token to BFF `/auth/session`
3. BFF validates, creates session, returns short-lived JWT (15 min)
4. BFF caches unwrapped KEK for session duration (5 min TTL, sliding)
5. Subsequent requests: JWT → BFF looks up cached KEK → decrypts/encrypts

### 4.4 No bulk send

- The BFF exposes **only** single-message send endpoints
- No batch send, no broadcast, no bulk import
- Rate limiter enforces per-tenant message rate (configurable, default: 60 msg/min)
- OpenWA's own `SEND_PACING_ENABLED=true` remains as a second layer

---

## 5. Frontend architecture (app/web)

### 5.1 Stack

- **Framework:** Next.js 15 (App Router, React Server Components)
- **Styling:** CSS variables for white-labeling (no Tailwind — keep it minimal)
- **Crypto:** libsodium-wrappers (WASM) for client-side XChaCha20-Poly1305
- **API client:** oRPC client (generated from BFF's oRPC router)
- **Deployment:** Vercel (white-labeled, custom domain per tenant)

### 5.2 White-labeling

```
app/web/src/
  app/
    [tenant]/          # Dynamic tenant slug
      layout.tsx       # Tenant-specific layout (logo, colors, fonts)
      page.tsx         # Dashboard
      messages/
        page.tsx       # Message list
        [id]/
          page.tsx     # Message detail
      contacts/
        page.tsx       # Contact list
      settings/
        page.tsx       # Tenant settings (key management, recovery)
  components/
    ui/                # Button, Input, Card, Modal, etc.
    crypto/            # Client-side crypto components
    white-label/       # Logo, ThemeProvider, FontLoader
  lib/
    api-client.ts      # oRPC client
    crypto.ts          # Client-side XChaCha20-Poly1305, Argon2id
    key-management.ts  # Device enrollment, key wrapping/unwrapping
    session.ts         # Session management, JWT refresh
  styles/
    white-label.css    # CSS custom properties for theming
    globals.css        # Base styles
```

**White-label mechanism:**
- Tenant slug in URL (`[tenant]`) → lookup tenant theme config
- Theme config: logo URL, primary color, font family, custom CSS
- Stored in Supabase `tenant_themes` table (public, non-sensitive)
- Applied via CSS custom properties + inline styles

### 5.3 Client-side crypto

- **Key derivation:** Argon2id (m=64 MiB, t=3, p=1) in a Web Worker
- **Message encryption:** XChaCha20-Poly1305 (libsodium-wrappers)
- **Media encryption:** secretstream (client-side, before upload to BFF)
- **Key storage:** IndexedDB (wrapped keys), never localStorage

---

## 6. Data flow

### 6.1 Send message

```
Client → BFF: { plaintext, recipient_jid }
  1. Auth: validate session, unwrap tenant KEK
  2. Rate-limit: check token bucket
  3. Generate message DEK (random 32B)
  4. Encrypt plaintext with DEK (XChaCha20-Poly1305, AAD = tenant_id|messages|row_id|v1)
  5. Wrap DEK with tenant KEK
  6. Generate blind index for recipient_jid
  7. Store: { ciphertext, wrapped_dek, dek_nonce, dek_version, blind_index } in Supabase
  8. Forward to OpenWA gateway (via auth proxy) for actual WhatsApp delivery
  9. Return: { message_id, timestamp } (no plaintext)
```

### 6.2 Receive message (from OpenWA webhook)

```
OpenWA webhook → BFF: { plaintext, sender_jid, timestamp }
  1. Validate webhook signature (API key + HMAC)
  2. Look up tenant by sender_jid (blind index match)
  3. Generate message DEK, encrypt, wrap, store (same as send)
  4. If client is online: push notification (WebSocket) with encrypted payload
  5. Client decrypts locally with its DEK (unwrapped from tenant KEK)
```

### 6.3 Search contacts

```
Client → BFF: { query: "+212612345678" }
  1. Auth: validate session
  2. Normalize query (E.164, NFC, trim)
  3. Compute blind_index = HMAC-SHA256(IK, normalize(query))[:16]
  4. Query Supabase: SELECT * FROM contacts WHERE blind_index = $1
  5. Decrypt contact names (if client has key)
  6. Return: [{ contact_id, display_name, ... }]
```

---

## 7. Database schema (new tables)

```sql
-- Tenant key management
CREATE TABLE tenant_keys (
  tenant_id UUID PRIMARY KEY,
  wrapped_kek BYTEA NOT NULL,
  kek_nonce BYTEA NOT NULL,
  kek_version INT NOT NULL DEFAULT 1,
  alg_id TEXT NOT NULL DEFAULT 'xchacha20poly1305',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Device enrollment
CREATE TABLE devices (
  device_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenant_keys(tenant_id),
  wrapped_kek BYTEA NOT NULL,  -- KEK wrapped for this device
  device_public_key BYTEA NOT NULL,  -- X25519 public key
  device_name TEXT,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages (ciphertext only)
CREATE TABLE messages (
  message_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  sender_ref TEXT NOT NULL,  -- blind index or opaque ID
  recipient_ref TEXT NOT NULL,
  ciphertext BYTEA NOT NULL,
  wrapped_dek BYTEA NOT NULL,
  dek_nonce BYTEA NOT NULL,
  dek_version INT NOT NULL DEFAULT 1,
  alg_id TEXT NOT NULL DEFAULT 'xchacha20poly1305',
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_tenant_sent ON messages(tenant_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_ref);
CREATE INDEX idx_messages_recipient ON messages(recipient_ref);

-- Contacts (ciphertext + blind index)
CREATE TABLE contacts (
  contact_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  phone_blind_index BYTEA,  -- HMAC-SHA256, nullable if no phone
  jid_blind_index BYTEA NOT NULL,  -- HMAC-SHA256
  name_ciphertext BYTEA,
  name_wrapped_dek BYTEA,
  name_dek_nonce BYTEA,
  name_dek_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_tenant_phone ON contacts(tenant_id, phone_blind_index);
CREATE INDEX idx_contacts_tenant_jid ON contacts(tenant_id, jid_blind_index);

-- Media objects (ciphertext in R2, metadata in Postgres)
CREATE TABLE media_objects (
  media_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  message_id UUID REFERENCES messages(message_id),
  r2_object_key TEXT NOT NULL,  -- opaque UUID, no metadata leakage
  ciphertext_size BIGINT NOT NULL,
  wrapped_dek BYTEA NOT NULL,
  dek_nonce BYTEA NOT NULL,
  dek_version INT NOT NULL DEFAULT 1,
  secretstream_header BYTEA,  -- for streaming decryption
  mime_type TEXT,  -- plaintext, needed for Content-Type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Key rotation jobs
CREATE TABLE key_rotation_jobs (
  job_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  key_type TEXT NOT NULL,  -- 'kek' | 'dek' | 'urk'
  old_version INT NOT NULL,
  new_version INT NOT NULL,
  cursor_position UUID,  -- last processed row
  status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'paused' | 'completed' | 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Recovery keys
CREATE TABLE user_recovery (
  recovery_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  wrapped_urk BYTEA NOT NULL,  -- URK wrapped by recovery mnemonic
  recovery_nonce BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log (unwrap events)
CREATE TABLE audit_log (
  audit_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_type TEXT NOT NULL,  -- 'user' | 'agent' | 'system'
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'unwrap' | 'rotate' | 'enroll' | 'revoke'
  resource_type TEXT NOT NULL,  -- 'message' | 'contact' | 'media' | 'kek'
  resource_id TEXT,
  success BOOLEAN NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_created ON audit_log(tenant_id, created_at DESC);

-- Tenant themes (white-label, public)
CREATE TABLE tenant_themes (
  tenant_id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1a73e8',
  font_family TEXT NOT NULL DEFAULT 'Inter',
  custom_css TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 8. Deployment

### 8.1 Staging (AWS)

- **BFF:** ECS Fargate (arm64) or Lambda + API Gateway
  - Environment: `staging`
  - Supabase: separate staging project (or same project, different schema)
  - R2: separate staging bucket
- **Frontend:** Vercel (preview deployments per PR)
- **Auth:** custom, as described above

### 8.2 Production (OCI)

- **BFF:** Docker container on the same A1 VM as OpenWA (or a second VM)
  - Environment: `production`
  - Supabase: production project (`openwa-ma`)
  - R2: production buckets (`openwa-media`, `openwa-backups`)
- **Frontend:** Vercel (production deployment, custom domain)
- **Cloudflare:** Tunnel + Access in front of BFF (phase 2)

### 8.3 OpenWA submodule

**Untouched.** The BFF communicates with OpenWA via its existing API (port 2785, `X-API-Key`). No changes to the OpenWA submodule, its compose, or its env vars.

---

## 9. Migration plan

### Phase 0 — Scaffold (this PR)
- [x] Architecture doc (this file)
- [x] Task tracker updated
- [x] `app/bff/` scaffold: package.json, tsconfig, domain ports, crypto service stubs
- [x] `app/web/` scaffold: package.json, next.config, white-label shell
- [ ] Drizzle migrations for new tables
- [ ] CI: typecheck + lint for both submodules

### Phase 1 — Core crypto
- [ ] XChaCha20-Poly1305 service (domain layer)
- [ ] Blind index service
- [ ] Argon2id key derivation (Web Worker)
- [ ] Key wrapping/unwrapping (AES-256-KW)
- [ ] Unit tests: encryption round-trip, blind index determinism, AAD binding

### Phase 2 — BFF use cases
- [ ] Send message (encrypt → store → forward to OpenWA)
- [ ] Receive message (webhook → encrypt → store → notify)
- [ ] Search contacts (blind index query)
- [ ] Media upload/download (secretstream + R2)
- [ ] Integration tests: full request flow with testcontainers

### Phase 3 — Auth & sessions
- [ ] Custom auth middleware (JWT + session)
- [ ] KEK cache (Bun KV, 5-min TTL, zeroize on eviction)
- [ ] Rate limiter (token-bucket, per tenant+endpoint)
- [ ] Auth proxy for OpenWA (scoped API keys)
- [ ] Web Workers for client-side key operations

### Phase 4 — Frontend
- [ ] oRPC client setup
- [ ] Client-side crypto (libsodium-wrappers)
- [ ] White-label theme system
- [ ] Message list + detail views
- [ ] Contact list + search
- [ ] Settings: key management, recovery, device enrollment

### Phase 5 — Rotation & recovery
- [ ] Key rotation jobs (idempotent, resumable)
- [ ] Recovery key enrollment flow
- [ ] Device enrollment (pairing code)
- [ ] Device revocation
- [ ] Audit log viewer

### Phase 6 — Production
- [ ] Staging deployment (AWS)
- [ ] Load testing (k6 or similar)
- [ ] Security audit (AD binding, nonce reuse, scope enforcement)
- [ ] Production deployment (OCI)
- [ ] Monitoring + alerting
- [ ] Backup/restore drill

---

## 10. Open decisions

| # | Question | Default | Status |
|---|---|---|---|
| 1 | Escrow at all? | **Off** | Open |
| 2 | Edge phone-resolution vs. server-side index? | Edge (BFF stores only `contact_id`) | Open |
| 3 | Shim point to encrypt before payloads leave OpenWA? | BFF webhook receiver | Open |
| 4 | Claude local or Anthropic-hosted for sensitive scopes? | Local | Open |
| 5 | n8n stays in OCI (routing) or moves local (full content)? | OCI routing | Open |
| 6 | Production BFF on OCI or AWS? | OCI (same VM as OpenWA) | Open |
| 7 | Supabase Auth or custom auth? | Custom (this design) | Decided |
| 8 | Client-side encryption opt-in? | Yes, per-tenant flag | Decided |

---

## 11. References

- `e2e-encryption-report.md` — full research artifact (34 KB, 14 sections)
- `docs/02-architecture.md` — existing system architecture
- RFC 9106 — Argon2
- RFC 3394 — AES Key Wrap
- RFC 8439 — ChaCha20 and Poly1305
- draft-irtf-cfrg-xchacha — XChaCha20-Poly1305
- libsodium documentation
- 1Password Security Design White Paper
- HashiCorp Vault Transit docs
