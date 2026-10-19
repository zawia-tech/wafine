-- Role-based access control for /admin. Additive: one column + one audit table.
-- Every existing and new account gets `user`; ADMIN_EMAILS accounts are `owner` at runtime
-- (bootstrap, decided by the BFF from a confirmed email) whatever this column says.
-- Applied by the captain with `supabase db push` BEFORE the BFF that reads `role` is deployed.

alter table public.user_profiles
  add column if not exists role text not null default 'user'
  constraint user_profiles_role_check check (role in ('owner', 'admin', 'support', 'viewer', 'user'));

-- Audit trail. No foreign key on purpose: the trail outlives the profile row (removing a number
-- from the allowlist cascades to user_profiles). KEEP ALL DATA.
create table if not exists public.user_role_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  changed_by       text not null,
  changed_by_email text not null,
  from_role        text not null check (from_role in ('owner', 'admin', 'support', 'viewer', 'user')),
  to_role          text not null check (to_role in ('owner', 'admin', 'support', 'viewer', 'user')),
  created_at       timestamptz not null default now()
);
create index if not exists user_role_events_user_created_idx
  on public.user_role_events (user_id, created_at);
alter table public.user_role_events enable row level security;
