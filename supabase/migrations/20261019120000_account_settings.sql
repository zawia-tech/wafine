-- Account self-service (settings page). Additive: two nullable columns on user_profiles.
--   display_name          shown in the header instead of the e-mail when set (1-80 chars).
--   closure_requested_at  the user asked to close the account. KEEP ALL DATA: nothing is deleted;
--                         the BFF also sets disabled_at so the account stops working until an
--                         admin reviews it in /admin -> Users.
-- Sorts after 20261018200000_user_roles.sql. Applied by the captain with `supabase db push`
-- BEFORE the BFF that reads these columns is deployed.

alter table public.user_profiles
  add column if not exists display_name text
  constraint user_profiles_display_name_check
  check (display_name is null or char_length(display_name) between 1 and 80);

alter table public.user_profiles
  add column if not exists closure_requested_at timestamptz;
