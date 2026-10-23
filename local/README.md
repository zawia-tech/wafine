# Local-first validation — no cloud, until the stack is mature

**Decision (2026-10-08):** do not spend anything on OCI or AWS until this stack is
demonstrably mature. Everything below runs on the workstation.

The cloud path is written and waiting — `terraform/oci` and `terraform/aws` both validate —
but neither is needed to answer the questions that actually block us. This directory exists
so those questions get answered for free.

## Why local-first is the right call, not just the cheap one

Three of the open problems are **not** cloud problems, and provisioning a VM would not have
touched any of them:

| Open problem | Does a VM help? |
|---|---|
| Which engine to ship (`whatsapp-web.js` vs `baileys`) | **No** — a comparison, not a deployment |
| Does the stack fit a 2 GB free instance | **Partly** — but measurable locally first |
| BFF/client KEK derivation disagree | **No** — pure code, found by reading the source |
| WhatsApp ToS position (D10) | **No** — deferred by decision |

So the cloud was about to become an expensive way to test code on a machine that already
exists. Doing it locally also means the engine comparison runs on **identical hardware under
identical conditions**, which is the only way that comparison means anything — two cloud VMs
of different shapes would have confounded it.

## Run it

From a dedicated dev worktree (isolated from `main`, see below), the Makefile is
the entry point:

```bash
make dev-up        # creates .claude/worktrees/dev on branch mo/dev-local-env
make local-up      # build + start one engine on 127.0.0.1:2785
make local-probe   # 15 memory samples vs the free-tier verdict
make local-down    # stop and remove the stack
```

Tuning the two-engine comparison: `LOCAL_ENGINE`, `LOCAL_PORT`, `LOCAL_PROJECT`.

Or raw compose (one engine, or both side by side):

```bash
OPENWA_ENGINE=whatsapp-web.js API_PORT=2785 \
  docker compose -p owa-webjs -f local/docker-compose.local.yml up -d --build
```

Both engines at once — this is the point of the exercise:

```bash
OPENWA_ENGINE=whatsapp-web.js API_PORT=2785 \
  docker compose -p owa-webjs    -f local/docker-compose.local.yml up -d --build

OPENWA_ENGINE=baileys API_PORT=2786 \
  docker compose -p owa-baileys -f local/docker-compose.local.yml up -d --build
```

Then:

| | |
|---|---|
| Dashboard | http://127.0.0.1:2785 (and :2786) |
| Swagger | http://127.0.0.1:2785/api/docs |
| Health | http://127.0.0.1:2785/api/health |
| Admin key | `ALLOW_DEV_API_KEY=true` seeds `dev-admin-key` |
| Tear down | `docker compose -p owa-webjs -f local/docker-compose.local.yml down` |

Data lives in `local/data/<engine>/` — one directory per engine, so the two runs cannot
contaminate each other. Both are gitignored.

## Isolated workspace (dedicated worktree)

Local dev runs in **`.claude/worktrees/dev`** on branch **`mo/dev-local-env`**,
so builds, `.env.local` and probes never touch the `main` workspace (which other
sessions use). `scripts/dev-env up|shell|down` manages it; `make dev-up` wraps it.
`scripts/tf` and `local/` are fully portable across worktrees — the docker stack
writes only to gitignored `local/{data,logs,qr}`.

## How this differs from the VM stack

Deliberately different in every place that touches a cloud service:

| `stack/compose.infra.yml` (VM) | `local/` (workstation) |
|---|---|
| Supabase Postgres via pooler | **SQLite**, zero-config |
| Cloudflare R2 / S3 | **local bind mount** |
| `cloudflared` tunnel | **none** — `127.0.0.1` only |
| Tailscale SSH for access | direct `docker exec` |
| `mem_limit: 8g` | `2g` — this host is not a VM |

Container hardening is **identical** (`no-new-privileges`, `cap_drop: ALL`, `read_only`,
`tmpfs /tmp`, `pids_limit`) so that anything learned locally transfers to the VM unchanged.

## Measuring the one thing that decides cost

```bash
./local/probe-memory.sh owa-webjs 30
```

Reports avg/peak cgroup memory, peak process count, and a verdict against **t4g.small
(2 GB)** — the only free Graviton size. This is the number that decides whether staging
costs money, so it gets measured rather than argued about.

⚠️ **A session must be LINKED for the measurement to mean anything.** An unlinked container
measures Nest plus migrations only, not a running WhatsApp engine. Link a session first, let
it settle, then probe.

## The comparison protocol

Run both engines, link a session on each, and record — in this order:

1. **Peak memory, linked and idle** — the cost question.
2. **Peak memory, one media send** — Chromium spikes on media; Baileys does not.
3. **Time to reach `WORKING`** after QR scan.
4. **Does it survive a restart** without re-linking (`AUTO_START_SESSIONS=true`).
5. **The operations the product needs** — send text, send media, receive, group ops.
   OpenWA documents specific Baileys gaps: `getChatHistory` returns `501`, and
   labels/channels/status/catalog are `501` too. **Verify each one against a live session**
   rather than trusting the changelog — these are exactly the kind of claim that goes stale.
6. **`ENGINE_TYPE=baileys` is a candidate, and `@whiskeysockets/baileys` is pinned at
   `7.0.0-rc14`** — a release candidate. Note any instability; a crash mid-session is a
   different risk class from a `501`.

Record results in this file as they are measured. **Do not record a number that was not
measured** — the rest of this project has already been burned three times by claims that
outran their evidence.

## Maturity gate — what "ready for cloud" means

Cloud deployment resumes when all of these hold:

- [ ] **One engine chosen**, with the numbers behind the choice recorded above.
- [ ] **BFF/client KEK derivation agree** — currently they do not (see below).
- [ ] `bun test` green in `app/web` **and** `app/bff`.
- [ ] The stack survives `down` + `up` with sessions still linked.
- [ ] End-to-end send **and** receive verified on a real number.
- [ ] `SEND_PACING_ENABLED` **on by default** — required by the D10 deferral, since
      anti-ban pacing is now the only protection.
- [ ] A measured memory number that fits the instance size actually being provisioned.

## Open defect carried into this work

⚠️ **BFF and client KEK derivations disagree.** Verified by reading both sources:

| | client (`app/web/src/lib/crypto.ts`) | BFF (`app/bff/.../argon2id.ts`) |
|---|---|---|
| Library | `libsodium-wrappers-sumo` | **`argon2`** (node-argon2) |
| Salt | `crypto_generichash(16, deviceSecret)` — **16 B** | `deviceSecret` — **32 B** |
| Salt arg order | `crypto_pwhash(out, passwd, salt, ops, mem)` ✅ | `{password, salt}` ✅ |

Two problems, not one:

1. **Different salt length** — 16 vs 32. This is the fix the client already has and the BFF
   does not.
2. **Different KDF library** — libsodium's `crypto_pwhash` and node-argon2 are both
   Argon2id, but nothing guarantees byte-identical output across implementations for the
   same parameters. **This needs an explicit cross-check test**, not an assumption.

It does not break today: `Argon2idKeyDerivationService` is constructed in `app/bff/src/index.ts`
but `deriveKek` is **never called**. It breaks the moment recovery is wired up. This is the
single most important code defect in the repo right now, because it is a *silent* one — the
two paths would disagree only at runtime, on a user's device.

## A note on libsodium, because this cost real time

The `-sumo` finding is **correct**, and was nearly reverted on bad advice. The full picture,
now verified by probing the package that is actually installed:

| Claim | Verdict |
|---|---|
| `crypto_pwhash` (Argon2id) is sumo-only | ✅ **TRUE** — confirmed: sumo v1.0.22, `crypto_pwhash` = `function`, `SALTBYTES` = 16 |
| `app/web` depends on sumo | ✅ `libsodium-wrappers-sumo@^0.8.4`, minimal package absent |
| An early probe said `crypto_pwhash` was `undefined` | ⚠️ **That probe was invalid** — it imported `libsodium-wrappers` (the minimal build, now uninstalled) and forgot `await sodium.ready`. Both faults at once. |
| The BFF needs the sumo swap | ❌ **NO** — the BFF never calls `crypto_pwhash`; it uses node-argon2. Its `libsodium-wrappers` is used only by `xchacha20.ts`, which needs `crypto_aead_xchacha20poly1305_ietf_*` — **present in the minimal build**. |

**Lesson, third time in this project:** a probe that contradicts a source you have not
re-read is not a refutation. I saw `undefined`, invented a more plausible story (broken
install), and nearly had a correct fix reverted. The probe was wrong, not the finding.
