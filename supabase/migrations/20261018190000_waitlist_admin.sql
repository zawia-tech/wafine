-- Admin actions for the waitlist: preserve every lead and record who changed its status.
-- Applied by the captain with `supabase db push`; the local Drizzle migration mirrors this
-- schema only for PGlite repository tests.

alter table public.waitlist
  add column if not exists invited_at timestamptz,
  add column if not exists removed_at timestamptz;

create table if not exists public.waitlist_events (
  id          uuid primary key default gen_random_uuid(),
  waitlist_id uuid not null references public.waitlist(id) on delete cascade,
  admin_id    text not null,
  action      text not null check (action in ('invited', 'rejected', 'removed', 'reopened')),
  from_status text not null check (from_status in ('pending', 'invited', 'rejected', 'removed')),
  to_status   text not null check (to_status in ('pending', 'invited', 'rejected', 'removed')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_waitlist_events_entry_created
  on public.waitlist_events (waitlist_id, created_at);
alter table public.waitlist_events enable row level security;
