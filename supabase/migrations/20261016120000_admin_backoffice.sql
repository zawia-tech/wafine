-- Admin backoffice: runtime settings, per-session API send-cap overrides, user disabling.
--
-- Apply with `supabase db push` (the single migration path). The matching Drizzle schema is
-- app/bff/src/infrastructure/db/schema/index.ts; app/bff/drizzle/0004_admin_backoffice.sql is the
-- local artifact the PGlite test replays, not the remote apply path.
--
-- Same model as the other BFF tables: `public`, RLS on with no policies, so only the table owner
-- (the BFF's `postgres` connection) can read or write them.
--
-- The API send caps live here, not in OpenWA: the engine's own pacing counts every outgoing row,
-- including what the number's owner types on the phone or WhatsApp Web (docs/09-sessions-keys-mcp.md).

create table if not exists public.bff_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null
);
alter table public.bff_settings enable row level security;

create table if not exists public.wa_session_limits (
  openwa_session_id  uuid primary key,
  per_day            integer check (per_day is null or per_day between 1 and 100000),
  per_minute         integer check (per_minute is null or per_minute between 1 and 1000),
  updated_at         timestamptz not null default now(),
  updated_by         text not null
);
alter table public.wa_session_limits enable row level security;

alter table public.user_profiles add column if not exists disabled_at timestamptz;

do $$
begin
  alter table public.wa_session_limits
    add constraint wa_session_limits_openwa_session_id_wa_sessions_openwa_session_id_fk
    foreign key (openwa_session_id) references public.wa_sessions(openwa_session_id)
    on delete cascade on update no action;
exception
  when duplicate_object then null;
end $$;
