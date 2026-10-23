# 11 — Media offload to object storage (Cloudflare R2), and retention

Goal: media lives in a private S3-compatible bucket — **Cloudflare R2** (same cloud as
the VM, Always Free, 20 GB), Cloudflare R2 supported as an option. Supabase keeps message text and
metadata, sessions and chats, without media bytes, and everything prunes itself.

Why: OpenWA stores every media payload as base64 inside `openwa.messages.metadata`. The Supabase free plan is
500 MB. On 2026-10-15 (read-only check) the database was 93 MB, `openwa.messages` 81 MB: 566 rows, 140 of them with
inline media (95 voice notes, 28 JPEGs, 8 videos holding 63 MB, 5 PDFs, 3 WebP, 1 HTML file), `mediaPath` set on 0
rows. That is about two days of traffic since go-live on 2026-10-14.

**Design change, 2026-10-14 (captain, relayed by firstmate):** the SaaS runs without Cloudflare Zero Trust and
without a tailnet for users. That replaces the earlier plan of serving a `media.` hostname behind Cloudflare
Access: there is **no media hostname, no custom domain, no Access app, no service token**. The bucket stays private,
and media is read through short-lived presigned GET links that the BFF mints after the user is authenticated.
There is also **no stopgap** (`MEDIA_DOWNLOAD_ENABLED=false` is not set on any node): the deployment goes straight
to the archive plus the strip trigger.

**Store decision, 2026-10-18 (captain):** object storage is **Cloudflare R2, EU jurisdiction**
EU jurisdiction; this matches the planned deployment and matches existing buckets in terraform/cloudflare.
Everything in this doc is written for Cloudflare R2 (EU).
in the code and at the end of the settings section.

## What is verified (OpenWA v0.24.0, `e9afb97`)

| Question | Answer | Where |
|---|---|---|
| How does media get into Postgres? | `buildMessageMetadata()` copies `message.media` (`{mimetype, data(base64), ...}`) into `metadata.media`. Inbound, own-send echo, history backfill and REST sends all go through it. | `modules/session/message-row.mapper.ts:31-52`, `message-projector.service.ts:395,705`, `message-send.service.ts` |
| Does `STORAGE_TYPE=s3` alone fix it? | No. Storage only receives what the chat-media archive writes, and the archive is off by default. | `modules/chat-media/chat-media-archive.service.ts` |
| Does the archive fix it? | No. It copies the file to `chat-media/<sessionId>/<uuid>.<ext>` and sets `mediaPath`, but deliberately **keeps** the inline copy ("doubles storage"). | `chat-media-archive.service.ts:52-58,132-180` |
| Is there a setting that keeps media out of Postgres? | No. `MEDIA_DOWNLOAD_ENABLED=false` only stops inbound downloads (the media is then lost, not stored elsewhere); REST sends still inline the caller's payload. | `engine/adapters/inbound-media-cap.ts:117` |
| Can the inline copy be dropped safely after archiving? | Yes. `getChatMedia` serves the archive first and only falls back to the inline copy; lists accept `{omitted: true, sizeBytes}`. The OpenWA dashboard then shows a click-to-load placeholder (it fetches the media route) instead of rendering the image inline. | `modules/message/message.service.ts:521-560`, `dashboard/src/components/chats/ChatThread.tsx:317` |
| Does the REST API expose the storage key? | Yes: `mediaPath` and `mediaMimetype` on every message list item. | `modules/message/dto/message-responses.dto.ts:105-113` |
| Retention | Owner rule 2026-10-18: keep all data, so every value below stays 0 (OpenWA treats 0/unset as keep forever). Built in: `MESSAGE_RETENTION_DAYS` (daily prune of `messages`), `AUDIT_RETENTION_DAYS` (the audit log in `main.sqlite`), `CHAT_MEDIA_ARCHIVE_TTL_DAYS` (deletes archived files of rows older than N days and clears their pointers, every 15 min). An hourly sweep deletes `chat-media/` objects no row references, after a 1 h grace. | `message-retention.service.ts`, `audit.service.ts:60`, `chat-media-archive.service.ts:217-280` |
| Does the S3 client force path-style? | Yes, whenever `S3_ENDPOINT` is set (`forcePathStyle: true`), and matches R2 EU setup. | `common/storage/storage.service.ts:110` |

## Design

```
write  WhatsApp -> OpenWA (VM) -> row with inline base64 -> chat-media archive -> bucket media/chat-media/<session>/<file>
                                                        -> sets mediaPath -> trigger strips metadata.media.data
read   engine route   GET /wa/sessions/<own>/messages/<chat>/<msg>/media   (streams the object, key-gated by the BFF)
       presigned link GET /api/wa/media-url?path=<mediaPath>   (Supabase session)
                       GET /wa/media-url?path=<mediaPath>       (user API key)
                       -> { url, expiresAt }: a GET on the private bucket, valid 300 s
prune  none by default (owner rule: keep all data); retention env and bucket expiry stay at 0 = keep forever
```

1. **Trigger.** `supabase/migrations/20261018130000_openwa_strip_archived_media.sql` removes `metadata.media.data`
   once `"mediaPath"` is set, so the bytes leave Postgres only after the stored copy and its pointer exist.
   `metadata` is a `text` column (not jsonb), hence the casts; any parse problem leaves the row alone. Offline
   test: `scripts/test-strip-trigger`.
2. **Presigned links.** `app/bff/src/adapters/http/routes/media-url.ts`. The `path` must be an archive key of the
   caller's **own** session (`chat-media/<own session id>/<file>`; anything else is 400 or 403). Links are signed
   with the same bucket-scoped token OpenWA uses (compose passes `S3_ENDPOINT`, `S3_REGION`,
   `S3_FORCE_PATH_STYLE`, the keys, `S3_BUCKET`, `S3_KEY_PREFIX` straight through to the BFF), last
   `MEDIA_URL_TTL_SECONDS` (default 300, clamped to 60-3600), and force `Content-Disposition: attachment` with a
   content type from a short allow-list, so a sender-declared type never renders as active content. Without the
   S3 keys the routes are not mounted. A link to an object the engine kept on its local fallback (store outage) or
   that retention already deleted answers 404 at the store; the engine route above still works in the first case.
3. **CORS** is not needed for `<img>`, `<video>`, `<audio>` or plain links. `media_cors_origins` in
   `terraform/cloudflare` adds a GET/HEAD rule only if a browser must `fetch()` the links **and** R2 is the store.
4. **Existing media.** `stack/media-backfill.sh` (dry run by default) moves rows stored before the archive was on:
   it backs up the `openwa` schema to the backups bucket, uploads each payload under the deterministic key
   `chat-media/<sessionId>/<rowId>.<ext>`, verifies size and MD5 against the store, then sets `mediaPath` so the
   trigger strips the row and OpenWA reads it like any archived file. Payloads are fetched from Postgres in
   batches (`--batch`, default 10) so one psql round trip covers a batch. A manifest (row, key, bytes, SHA-256)
   goes next to the backup. Offline test: `scripts/test-media-backfill`.
5. **Nothing is pruned by default.** The owner rule (2026-10-18) is keep all data, so MESSAGE_RETENTION_DAYS,
   CHAT_MEDIA_ARCHIVE_TTL_DAYS and AUDIT_RETENTION_DAYS stay 0 (OpenWA: keep forever) and the bucket has no expiry
   rule. If the owner later picks a retention period, set it in OpenWA's env and, only as a second line, in
   `media_retention_days`: the bucket counts from the upload date, OpenWA from the message date.
6. **What stays where.** Supabase (`openwa` schema): messages (text + metadata, no media bytes), chats, sessions,
   status updates. The VM volume: `main.sqlite` with API keys and the audit log (always SQLite, never Supabase),
   and WhatsApp auth state. Object storage: media files and backups.
7. **Size gap.** Media above `CHAT_MEDIA_ARCHIVE_MAX_BYTES` (25 MiB) is never archived and would stay inline, so
   `MEDIA_DOWNLOAD_MAX_BYTES` is set to the same value. That cap also limits URL-based and base64 REST sends.

## The store: Cloudflare R2 (EU)

Owner decision, 18/10/2026: media and backups live in **Cloudflare R2, EU jurisdiction**. OCI Object
Storage is not used for media (an earlier OCI plan, `terraform/oci/media.tf`, is superseded and never applied).

| | Cloudflare R2 (EU) |
|---|---|
| Buckets | `openwa-media`, `openwa-backups`, created by `terraform/cloudflare/main.tf` (`r2_jurisdiction = "eu"`) |
| Endpoint | `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` — the `.eu.` part is mandatory for EU buckets |
| Keys | Cloudflare dashboard → R2 → Manage API tokens → **Object Read & Write**, scoped to the two buckets → `pass cloudflare/r2/openwa-vm` |
| `.env` | `S3_PROVIDER=Cloudflare`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true` |

**Endpoint traps.**

- EU-jurisdiction buckets are invisible on `<ACCOUNT_ID>.r2.cloudflarestorage.com`; only the `.eu.` endpoint sees them.
- OpenWA probes the bucket at boot (`HeadBucket`, then `CreateBucket` on NotFound,
  `common/storage/storage.service.ts:170-189`). A token scoped to the two existing buckets cannot create
  buckets, so a wrong endpoint fails loudly instead of creating a stray bucket.
- Path style: OpenWA forces it whenever `S3_ENDPOINT` is set and R2 accepts it, so the rclone scripts
  and the BFF use it too (`S3_FORCE_PATH_STYLE=true`).

## Nodes that share the database

| Node | State (2026-10-15, read-only) | What it needs |
|---|---|---|
| OCI VM `wafine-vm` | Holds the WhatsApp session, `STORAGE_TYPE=local`, archive off. | All settings below, then a restart. |
| Operator workstation (`<repo-root>`, compose project `openwa`) | **Not running**: 0 containers (only the `openwa_openwa-data` and `openwa_redis-data` volumes remain). Its `stack/.env` still has `STORAGE_TYPE=s3` with an old endpoint and no archive settings. | Nothing while it stays off. Before it is ever started against the shared database again, copy the same media and retention settings (the same endpoint as the VM), or it re-inlines media. |

## Settings (every node that shares the database)

Source of truth: `stack/.env.example`.

```
STORAGE_TYPE=s3
S3_PROVIDER=Cloudflare
S3_ENDPOINT='https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com'
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
S3_BUCKET=openwa-media
S3_KEY_PREFIX=media/
S3_ACCESS_KEY_ID=...        # secret, stack/.env only
S3_SECRET_ACCESS_KEY=...    # secret, stack/.env only
CHAT_MEDIA_ARCHIVE_ENABLED=true
CHAT_MEDIA_ARCHIVE_OUTBOUND=true
CHAT_MEDIA_ARCHIVE_MAX_BYTES=26214400
MEDIA_DOWNLOAD_MAX_BYTES=26214400
CHAT_MEDIA_ARCHIVE_TTL_DAYS=0   # keep archived media forever (owner rule 2026-10-18: keep all data)
MESSAGE_RETENTION_DAYS=0        # never prune messages
AUDIT_RETENTION_DAYS=0          # keep the audit log forever
MEDIA_URL_TTL_SECONDS=300   # BFF only
```

`scripts/stack-check` asserts this wiring on the rendered compose project (the engine archives to an `https://`
path-style endpoint and prunes nothing (all retention values 0); the BFF signs with the engine's bucket, prefix and token).
`stack/preflight.sh` and `stack/backup.sh` read `S3_PROVIDER` for their rclone config and skip the store while
the endpoint is empty.


## Free-plan fit (R2 free tier)

| Item | Allowance | Our use |
|---|---|---|
| Storage | 10 GB-month free, then pay per GB-month | all media and backups kept (no expiry), 25 MiB cap per file; watch usage and ask the owner before adding any retention |
| Operations | 1M Class A and 10M Class B per month free | a few thousand per day; each presigned read is one GET |
| Egress | free | presigned reads and engine reads |
| Lifecycle rules | none (keep all data) | — |
| Supabase | 500 MB DB | text only after this change; messages kept forever |

Capacity math and fair-share quotas: see the storage research note (operator vault).

## Captain steps (console)

1. **R2 API token**: Cloudflare dashboard → R2 → Manage API tokens → *Create API token*, permission
   **Object Read & Write**, scoped to `openwa-media` and `openwa-backups` (name `openwa-vm`). Copy the key **once** into `pass cloudflare/r2/openwa-vm`
   (fields `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`). Never paste them in chat, a commit or a log.
2. **Terraform**: the buckets already exist (imported into `terraform/cloudflare` state with the EU
   jurisdiction, 18/10/2026). `scripts/tf cloudflare plan` should show no bucket changes.
3. **Endpoint**: `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` (account id from the Cloudflare
   dashboard or `terraform/cloudflare` variables) into the VM's `stack/.env`.

## Live-apply runbook

Each step waits for an explicit yes. Terraform always runs through `scripts/tf cloudflare ...`, never bare `tofu`.

**0–1. Buckets** (done 18/10/2026). `openwa-media` and `openwa-backups` exist in R2 with the EU jurisdiction and
are imported into `terraform/cloudflare` state. Check, read-only: `scripts/tf cloudflare plan` shows no change to
`cloudflare_r2_bucket.media` / `.backups`. No lifecycle rule exists, and none is added (keep all data).

**2. Keys + env (captain step 1)**, then on the VM put the settings above into `/opt/wa/stack/.env`, keeping
`CHAT_MEDIA_ARCHIVE_ENABLED=false` for now. Check without printing keys: `stack/preflight.sh` passes its
object-storage section.

**3. Trigger migration** (DB write; confirm the linked project ref in `supabase/.temp/project-ref` first). Read-only first:

```bash
supabase migration list   # only 20261018130000 and the waitlist migrations (20261017120000, 20261018120000) may be pending; stop if anything else is
```
```sql
select count(*) total, count(*) filter (where metadata like '%"data":"%') inline_media_rows,
       pg_size_pretty(pg_total_relation_size('openwa.messages')) messages_size
from openwa.messages;
```

Then `supabase db push` (explicit yes). Verify: `select tgname from pg_trigger where tgrelid = 'openwa.messages'::regclass and not tgisinternal;`
returns `strip_archived_media`. Rollback: `drop trigger strip_archived_media on openwa.messages; drop function openwa.strip_archived_media();`.

**4. Archive on (VM)**: set `CHAT_MEDIA_ARCHIVE_ENABLED=true`, then from the workstation `PUSH_ENV=1 scripts/deploy.sh`
(or on the VM `stack/wa up -d openwa-api bff`). Verify:

- `stack/wa logs openwa-api | grep -iE "S3|falling back|Created S3 bucket"` shows no fallback and no `Created S3 bucket`.
- Send a test image to the linked number, then
  `select "mediaPath", metadata::jsonb -> 'media' from openwa.messages order by "createdAt" desc limit 1;`
  shows `chat-media/...` and `{"omitted": true, "mimetype": ..., "sizeBytes": ...}` without `data`.
- The engine route returns the bytes: `GET <api-host>/wa/sessions/<id>/messages/<chatId>/<messageId>/media`
  with a user key.

Rollback: `CHAT_MEDIA_ARCHIVE_ENABLED=false`, restart. Rows already stripped stay readable from the store (nothing expires).

**5. Existing media**: on the VM, `stack/media-backfill.sh` (dry run: rows and bytes per mimetype; about 140 rows and
57 MB decoded as of 2026-10-15, more by then). Then `stack/media-backfill.sh --apply`: it takes the backup first and
stops if that upload is not verified. Resumable with `--limit N`; batches can be tuned with `--batch N`. Verify: a
dry run afterwards shows 0 rows to move (or only rows it reported as skipped), and the manifest
`backups/media-backfill-<ts>.tsv` is in `openwa-backups/<host>/`. Rollback: restore
`pre-media-backfill-<ts>.dump` into a scratch database (`pg_restore -t messages`), then copy `metadata` back and
clear `mediaPath` for the manifest's row ids; the stored objects stay in the bucket.

**6. Reclaim space** (separate yes; takes an exclusive lock on `openwa.messages` for a few seconds at this size, so
OpenWA writes wait): `VACUUM (FULL, ANALYZE) openwa.messages;`, then
`select pg_size_pretty(pg_database_size(current_database()));`. Plain autovacuum reuses the space without returning it.

**7. Presigned links (BFF)**: with the BFF recreated in step 4 and a signed-in user,
`GET <api-host>/api/wa/media-url?path=<mediaPath>` returns `{url, expiresAt}`; `curl -sI "$url"` is
`200` with `content-disposition: attachment`, and the same URL after `expiresAt` is `403`. A `path` from another
session is `403`. The bucket itself is not public: the same object URL without a signature is `403`/`404`, and
no public hostname or custom domain exists.

**8. Retention check**: `stack/wa logs openwa-api | grep -iE "retention|pruned"` must show retention DISABLED
(keep forever) and no "Pruned" lines. If it reports a retention period, stop: the env has a non-zero value.

**Not in this runbook** (follow-ups): moving ingress to the VM, a least-privilege DB role for OpenWA and the BFF
(both connect as the admin role today), the WhatsApp number question, BFF auth, a messages view in the web app that
uses the presigned links.

## Merge note

The R2 buckets are managed in `terraform/cloudflare` (EU jurisdiction, imported 18/10/2026).
`terraform/oci/media.tf` and `variables_media.tf` are a superseded OCI plan, never applied; they can be removed in a
separate change. Nothing here touches the tunnel, DNS or the gateway's Access resources.
