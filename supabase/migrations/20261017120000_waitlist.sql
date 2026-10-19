-- Landing-page waitlist: leads captured by the public form on the web app.
--
-- Apply with `supabase db push` (the single migration path). The matching Drizzle schema is
-- app/bff/src/infrastructure/db/schema/index.ts; app/bff/drizzle/0005_waitlist.sql is the local
-- artifact the PGlite test replays, not the remote apply path.
--
-- Same model as the other BFF tables: `public`, RLS on with no policies, so only the table owner
-- (the BFF's direct Postgres role) can read or write it. A waitlist row grants nothing: an admin
-- still invites the number into `allowlisted_numbers` before sign-up accepts it.
--
-- `email` is the natural key and is stored lower-cased by the BFF, so a repeat submission is a
-- no-op (`on conflict do nothing`) and cannot be used to discover who has already signed up.

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  wa_number   text,
  use_case    text,
  locale      text not null default 'en',
  created_at  timestamptz not null default now()
);
alter table public.waitlist enable row level security;
