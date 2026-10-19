-- OAuth 2.1 authorization server state for MCP connectors such as Claude (docs/10-claude-connector.md).
--
-- Apply with `supabase db push`. Matching Drizzle schema: app/bff/src/infrastructure/db/schema/index.ts;
-- app/bff/drizzle/0003_oauth_connectors.sql is the local artifact the PGlite test replays.
--
-- RLS on, no policies: only the table owner (the BFF's `postgres` connection) reads or writes.
-- oauth_tokens holds SHA-256 hashes only. oauth_grants.openwa_key_enc is AES-256-GCM sealed with
-- OAUTH_ENC_KEY, which lives only in the VM's stack/.env.

create table if not exists public.oauth_clients (
  client_id     text primary key,
  client_name   text not null,
  redirect_uris jsonb not null,
  created_at    timestamptz not null default now()
);
alter table public.oauth_clients enable row level security;

create table if not exists public.oauth_grants (
  id              text primary key,
  user_id         uuid not null,
  client_id       text not null,
  openwa_key_id   text not null,
  openwa_key_enc  text not null,
  scope           text not null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);
alter table public.oauth_grants enable row level security;

create table if not exists public.oauth_tokens (
  token_hash  text primary key,
  grant_id    text not null,
  kind        text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.oauth_tokens enable row level security;

do $$
begin
  alter table public.oauth_grants
    add constraint oauth_grants_user_id_wa_sessions_user_id_fk
    foreign key (user_id) references public.wa_sessions(user_id) on delete cascade on update no action;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.oauth_grants
    add constraint oauth_grants_client_id_oauth_clients_client_id_fk
    foreign key (client_id) references public.oauth_clients(client_id) on delete cascade on update no action;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.oauth_tokens
    add constraint oauth_tokens_grant_id_oauth_grants_id_fk
    foreign key (grant_id) references public.oauth_grants(id) on delete cascade on update no action;
exception when duplicate_object then null;
end $$;

create index if not exists oauth_grants_user_idx on public.oauth_grants(user_id);
create index if not exists oauth_tokens_grant_idx on public.oauth_tokens(grant_id);
