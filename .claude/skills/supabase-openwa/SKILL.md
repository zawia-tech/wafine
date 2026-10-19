---
name: supabase-openwa
description: Supabase as OpenWA's remote datastore — the isolated `openwa` schema and least-privilege role, Supavisor session-pooler connection over IPv4, the Postgres CA, and checks that nothing leaks through the Data API. Media and backups go to Cloudflare R2, not Supabase Storage. Use when setting up or debugging the database/storage side, rotating DB or S3 credentials, or querying WhatsApp data stored by OpenWA.
---

# Supabase as OpenWA's datastore

OpenWA has native PostgreSQL support (TypeORM). It **creates and migrates its own tables** at boot in `POSTGRES_SCHEMA`. We don't hand-write OpenWA tables; `supabase/migrations/20261007120000_openwa_datastore.sql` only prepares:
- schema `openwa`: not in the Data API's exposed schemas; anon/authenticated revoked.
- role `openwa`: `grant usage, create on schema openwa`, `search_path = openwa, public`, `timezone = UTC`, connection limit 20. It is created NOLOGIN; the password is set out-of-band.
- private buckets `openwa-media` and `openwa-backups`.

API keys and audit (`main.sqlite`) and WhatsApp auth state stay on the VM volume `/app/data`. That's an upstream design choice. `stack/backup.sh` ships them to `openwa-backups`.

## Connection (from the OCI VM, which is IPv4-only)
- **Session pooler**, port 5432: host `aws-N-<region>.pooler.supabase.com` (copy it from Dashboard → Connect), user `openwa.<project_ref>`.
- Not the transaction pooler (6543): OpenWA relies on session-level settings (search_path, UTC pin).
- Not direct `db.<ref>.supabase.co`: that's IPv6 unless the IPv4 add-on is bought.
- TLS: `DATABASE_SSL=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, with the project CA in `stack/certs/supabase-ca.crt` (mounted as `NODE_EXTRA_CA_CERTS`).
- `stack/preflight.sh` proves TLS, login, search_path, UTC, CREATE privilege and the S3 buckets. Run it after any credential change.

## Project
`openwa-ma`, eu-west-3, free org `ai4x-openwa`. The project ref lives in the operator vault and, once linked, in `supabase/.temp/project-ref`; confirm it before any write. Pooler: `aws-1-eu-west-3.pooler.supabase.com:5432`.
The Supabase MCP connector is authorised for the paid org only and **cannot see this project**. Use the CLI, which is linked:
`supabase db push --password "$(cat ~/.config/infra/openwa-ma-postgres-password)"`.
Use a `--dry-run` first.
Verified on 2026-10-07:
- the pooler certificate `*.pooler.supabase.com` verifies against `stack/certs/supabase-ca.crt` (Supabase Root 2021 CA), hostname included;
- Supavisor honours the `options=-c search_path=…` startup parameter.

## Applying the migration
Apply migrations to the **chosen project only**: the user has many projects, so confirm the project ref first. Then the user sets the password out-of-band:
```sql
alter role openwa with login password '<openssl rand -base64 36>';
```
Never write that password into a migration, a file in git, or the chat.

## Verification queries (`psql` through the pooler as `postgres.<ref>`; the MCP connector can't reach this project)
```sql
-- OpenWA tables landed in openwa, not public
select table_schema, count(*) from information_schema.tables
 where table_schema in ('openwa','public') group by 1;
-- no API role can touch them
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'openwa' and grantee in ('anon','authenticated');   -- expect 0 rows
-- connections in use by the gateway
select count(*) from pg_stat_activity where usename = 'openwa';
```
Also check the dashboard's Security Advisor after the first boot.

## Storage
- **Decision 2026-10-18: media and backups go to OCI Object Storage** (Always Free, same tenancy as the VM; changed from Cloudflare R2, which stays an option). Live runbook: `docs/11-media-storage.md`.
  - OCI is path-style only: `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`; keys are Customer Secret Keys (`pass oci/<profile>/media-bucket`).
  - The Supabase buckets `openwa-media` and `openwa-backups` exist but are unused. Keep them as a fallback (endpoint `https://<ref>.storage.supabase.co/storage/v1/s3`, path-style). Their S3 keys bypass RLS on **all** buckets.
  - Config lives in `stack/.env`: `S3_PROVIDER=Other`, the OCI endpoint, `S3_REGION=<region>`, `S3_FORCE_PATH_STYLE=true`, `STORAGE_TYPE=s3` once keys are set.
- OpenWA does not persist message media by default; it is returned inline to API/webhook consumers. Archive media with `CHAT_MEDIA_ARCHIVE_ENABLED=true`. It lands in `openwa-media/media/`.

## Data residency note
The VM is in Morocco (af-casablanca-1), but Supabase has no African region; the nearest is eu-west-3 Paris. Storing WhatsApp personal data there is an international transfer under Moroccan law 09-08 (CNDP). Flag this to the user for any production or client deployment. It is not a technical blocker.
