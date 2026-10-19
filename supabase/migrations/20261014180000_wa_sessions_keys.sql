-- Per-user WhatsApp session ownership and user-issued OpenWA API keys.
--
-- Apply with `supabase db push` (the single migration path). The matching Drizzle schema is
-- app/bff/src/infrastructure/db/schema/index.ts; app/bff/drizzle/0002_wa_sessions_keys.sql is the
-- local artifact the PGlite test replays, not the remote apply path.
--
-- Both tables live in `public`: RLS is on with no policies, so only the table owner (the BFF's
-- `postgres` connection, see docs/08-signup-allowlist.md) can read or write them.
-- wa_api_keys stores only the SHA-256 of each key; the plaintext is shown to the user once.

create table if not exists public.wa_sessions (
  user_id           uuid primary key,
  openwa_session_id uuid not null,
  name              text not null,
  created_at        timestamptz not null default now(),
  constraint wa_sessions_openwa_session_id_unique unique (openwa_session_id)
);
alter table public.wa_sessions enable row level security;

create table if not exists public.wa_api_keys (
  id          text primary key,
  user_id     uuid not null,
  key_prefix  text not null,
  key_hash    text not null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint wa_api_keys_key_hash_unique unique (key_hash)
);
alter table public.wa_api_keys enable row level security;

do $$
begin
  alter table public.wa_sessions
    add constraint wa_sessions_user_id_user_profiles_user_id_fk
    foreign key (user_id) references public.user_profiles(user_id)
    on delete cascade on update no action;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.wa_api_keys
    add constraint wa_api_keys_user_id_wa_sessions_user_id_fk
    foreign key (user_id) references public.wa_sessions(user_id)
    on delete cascade on update no action;
exception
  when duplicate_object then null;
end $$;
