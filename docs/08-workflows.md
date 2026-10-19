# 08 — Auto-reply workflows (webhook → rules → paced reply)

PoC decision D-8: one automated reply with **no LLM**. Rules are deterministic text matches; replies go only to
**allowlisted** contacts and only through a pacing layer that imitates a person.

```
OpenWA ── POST /webhook/openwa (HMAC) ─▶ BFF ─▶ WorkflowEngine ─▶ PacedReplySender ─▶ OpenWA send-text
                                                  │ structural filters → tenant → allowlist → rule → toggle → cooldown
```

## Rules (`app/bff/src/domain/workflows/rules.ts`)

| Rule id | Trigger (case-insensitive, trailing `!.,?` ignored) | Reply | Limit |
|---|---|---|---|
| `ping-pong` | exactly `ping` | `pong` | none |
| `greeting` | exactly `hello`, `hi`, `salam` or `bonjour` | fixed greeting text | once per contact per 24 h |

Rules start **off** for every tenant (`WORKFLOW_DEFAULT_ENABLED=false`). A signed-in user turns them on with
`PUT /api/workflows/:ruleId` `{"enabled": true}` from `/workflows` in the web app. `GET /api/workflows` lists them.
State is in memory (resets on BFF restart) behind `IWorkflowStore`.

> **The toggle routes are not reachable yet.** Every `/api/*` request goes through `createAuthMiddleware`, which
> needs `ISessionCache.getKek(sessionId)` to return a KEK — but nothing in the BFF ever calls `cacheKek`, so each
> request is rejected with `401` and `/workflows` bounces to `/auth/login`. Session issuance (caching the KEK) is a
> separate follow-up; until it lands, enable workflows with `WORKFLOW_DEFAULT_ENABLED=true` (the env flag) rather
> than through the UI/API.

Ignored, never answered: own messages, groups, status broadcasts, non-text, `@lid` chats, contacts that are not on the
tenant's allowlist, unknown sessions.

## Pacing (`infrastructure/workflows/paced-sender.ts`)

- One serial queue per session: a minimum gap between sends (`WORKFLOW_MIN_GAP_MS`, 3 s) plus a random 1.2–3.5 s
  "reading" delay and ~45 ms per character "typing" delay (cap 4 s).
- Replies are dropped, not queued, past the limits: 2/min per contact, 6/min per session
  (`WORKFLOW_MAX_PER_MINUTE_CONTACT` / `_SESSION`), 10 waiting per session, 600 characters per reply.
- `429` from the gateway (`code: SEND_PACING_LIMITED`) opens a backoff window for that session (`Retry-After`, else
  `WORKFLOW_BACKOFF_MS`, 15 min) during which every reply is dropped. **No send is ever retried.** A greeting that was
  not delivered gives its 24 h slot back.

Anything an AI tool writes later must go through the same `IReplySender`.

## Configuration

| Var | Default | Purpose |
|---|---|---|
| `OPENWA_WEBHOOK_SECRET` | — | HMAC secret (≥16 chars). Empty = every webhook is rejected with 401. |
| `WORKFLOW_BINDINGS` | `` | JSON `[{"tenantId":"<Supabase user id>","sessionId":"<OpenWA session id>","allowlist":["+212…"]}]`. PoC seed for the tenant↔session map and allowlist; the allowlist dashboard replaces it by implementing `ITenantDirectory` + `IContactAllowlist`. |
| `WORKFLOW_DEFAULT_ENABLED` | `false` | initial state of the toggles |
| `WORKFLOW_MIN_GAP_MS`, `WORKFLOW_MAX_PER_MINUTE_SESSION`, `WORKFLOW_MAX_PER_MINUTE_CONTACT`, `WORKFLOW_BACKOFF_MS` | see above | pacing |

## Registering the webhook on the gateway (not done by this change)

Run once per session, with an operator-role key from the vault (never paste it into chat or git). The secret must equal
`OPENWA_WEBHOOK_SECRET` on the BFF.

```bash
curl -sS -X POST "$OPENWA_URL/api/sessions/$SESSION_ID/webhooks" \
  -H "X-API-Key: $OPENWA_API_KEY" -H 'Content-Type: application/json' \
  -d '{
        "url": "http://<bff-host>:4000/webhook/openwa",
        "events": ["message.received"],
        "secret": "<same value as OPENWA_WEBHOOK_SECRET>"
      }'
```

`<bff-host>` is the BFF container/VM address as seen **from the OpenWA container**. OpenWA refuses private addresses
(SSRF guard, `400` at registration): either use the public `https://api.example.com/webhook/openwa` through the
tunnel, or add the BFF host to `SSRF_ALLOWED_HOSTS` on the gateway (needs an `OpenWA/docker-compose.yml` env check first:
upstream compose forwards an explicit env-var list, so a variable missing there never reaches the engine). Verify with `POST /api/sessions/$SESSION_ID/webhooks/<id>/test`, then send `ping` from an allowlisted
number.

## Known gaps

- Bearer auth is Supabase (`docs/08-signup-allowlist.md`). The tenant is the verified Supabase **user id** (one tenant per user for the PoC), set server-side from the token; the BFF never accepts a client-supplied tenant header. So `tenantId` in `WORKFLOW_BINDINGS` must be a Supabase user id for now; the allowlist store replaces the static directory later.
- OpenWA also has its own `AutomationRule` autoreply engine; do not enable both for the same session.
- Toggles/cooldowns are in memory; persisting them needs a migration (a new file in `supabase/migrations/`).
