-- Follow-up to 20261011120000_ops_health_snapshots.sql, fixing two failures hit on the live project:
--  1. ops.health_snapshots has RLS enabled but no policy, so health_monitor's INSERT ... RETURNING
--     (inside ops.capture_health_snapshot) was denied. Add insert + select policies.
--  2. `alter default privileges for role openwa ...` fails on Supabase (postgres is neither superuser
--     nor a member of role openwa). postgres owns the openwa tables, so the form without FOR ROLE
--     covers the tables it creates later.
-- Idempotent: safe to re-run, and a no-op on the live DB where both were applied by hand.
-- Apply as the postgres login: psql -1 -f <file>, or `supabase db push`.

drop policy if exists health_monitor_insert on ops.health_snapshots;
create policy health_monitor_insert on ops.health_snapshots
  for insert to health_monitor with check (true);

drop policy if exists health_monitor_select on ops.health_snapshots;
create policy health_monitor_select on ops.health_snapshots
  for select to health_monitor using (true);

alter default privileges in schema openwa grant select on tables to health_monitor;
