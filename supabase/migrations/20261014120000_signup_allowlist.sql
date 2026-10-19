-- Invite-only sign-up: the E.164 number allowlist and the user→number binding.
--
-- Apply with `supabase db push` (the single migration path for this project).
-- Do NOT run `drizzle-kit migrate` / `bun run db:migrate` against the remote: that would create
-- a second, competing ledger next to `supabase_migrations.schema_migrations`.
-- The matching Drizzle schema is app/bff/src/infrastructure/db/schema/index.ts; the generated
-- app/bff/drizzle/0001_last_scrambler.sql is the local artifact the PGlite test replays, not the
-- apply path for the remote.
--
-- Both tables live in `public`, so PostgREST would expose them: RLS is enabled with no policies,
-- so only the BFF's direct Postgres role (which owns the tables and so bypasses RLS) reads them.

create table if not exists public.allowlisted_numbers (
  phone_e164 text primary key,
  added_by   text not null,
  added_at   timestamptz not null default now()
);
alter table public.allowlisted_numbers enable row level security;

create table if not exists public.user_profiles (
  user_id    uuid primary key,
  email      text not null,
  phone_e164 text not null,
  created_at timestamptz not null default now(),
  constraint user_profiles_phone_e164_unique unique (phone_e164)
);
alter table public.user_profiles enable row level security;

do $$
begin
  alter table public.user_profiles
    add constraint user_profiles_phone_e164_allowlisted_numbers_phone_e164_fk
    foreign key (phone_e164) references public.allowlisted_numbers(phone_e164)
    on delete cascade on update no action;
exception
  when duplicate_object then null;
end $$;
