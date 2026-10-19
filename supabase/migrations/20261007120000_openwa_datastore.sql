-- Prepares a Supabase project to be OpenWA's PostgreSQL data store.
--
-- OpenWA creates and upgrades its own tables at boot (TypeORM migrations, POSTGRES_SCHEMA=openwa).
-- This migration only provides what OpenWA cannot do for itself on managed Postgres:
--   * an isolated `openwa` schema that the Data API (PostgREST) does not expose
--   * a least-privilege login role `openwa` (NOT postgres / service_role)
--   * private Storage buckets for media and backups
--
-- After applying, enable the role out-of-band (never commit the password):
--   alter role openwa with login password '<generated>';
-- See .claude/skills/supabase-openwa/SKILL.md (role and connection setup).

create schema if not exists openwa;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'openwa') then
    create role openwa nologin connection limit 20;
  end if;
end $$;

-- OpenWA needs to CREATE its tables/indexes and run its migration ledger in this schema.
grant usage, create on schema openwa to openwa;

-- Nobody else: the anon/authenticated API roles get nothing here, even if someone later adds
-- `openwa` to the exposed schemas by mistake.
revoke all on schema openwa from public, anon, authenticated;

-- OpenWA sets search_path through the libpq `options` startup parameter; pinning it on the role
-- as well keeps raw migration DDL in `openwa` even if a pooler drops that parameter.
alter role openwa set search_path = openwa, public;
-- OpenWA refuses to boot unless the session TimeZone is UTC.
alter role openwa set timezone = 'UTC';

-- Private buckets, reached through Supabase Storage's S3 endpoint by the VM only.
insert into storage.buckets (id, name, public)
values
  ('openwa-media', 'openwa-media', false),
  ('openwa-backups', 'openwa-backups', false)
on conflict (id) do nothing;
