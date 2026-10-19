-- Nightly health snapshots, written by .github/workflows/nightly-health.yml.
--
-- Lives in its own `ops` schema (not exposed to the Data API) so it never mixes with OpenWA's tables.
-- The job connects as `health_monitor`: read-only on the `openwa` schema, insert-only on ops.health_snapshots.
-- Apply as the `postgres` login (psql -1 -f <file>, or `supabase db push`). That login is not a superuser,
-- so nothing here may use FOR ROLE <other role>. The follow-up migration 20261012120000 adds the RLS
-- policies and the default-privileges grant for future openwa tables.
-- Enable the login out-of-band (never commit the password):
--   alter role health_monitor with login password '<generated>';

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'health_monitor') then
    create role health_monitor nologin connection limit 3;
  end if;
end $$;

create table if not exists ops.health_snapshots (
  id              bigint generated always as identity primary key,
  captured_at     timestamptz not null default now(),
  db_size_bytes   bigint      not null,
  table_counts    jsonb       not null,  -- {"<openwa table>": exact row count}
  newest_message_at timestamptz,         -- null when no message table/rows exist yet
  probes          jsonb       not null default '{}'::jsonb,  -- {"<target>": "ok" | "fail: ..."}
  ok              boolean     not null default true
);
create index if not exists health_snapshots_captured_at_idx on ops.health_snapshots (captured_at desc);
alter table ops.health_snapshots enable row level security;

-- Metrics + insert in one call. SECURITY INVOKER: it only sees what health_monitor may read.
create or replace function ops.capture_health_snapshot(p_probes jsonb, p_ok boolean)
returns ops.health_snapshots
language plpgsql
as $fn$
declare
  counts jsonb := '{}'::jsonb;
  t text;
  newest timestamptz;
  col text;
  row_ ops.health_snapshots;
begin
  for t in select tablename from pg_tables where schemaname = 'openwa' order by 1 loop
    counts := counts || jsonb_build_object(
      t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from openwa.%I', t), false, true, '')))[1]::text::bigint);
  end loop;

  -- Newest message: first table named like "message(s)" with a created-at style column.
  select c.table_name, c.column_name into t, col
  from information_schema.columns c
  where c.table_schema = 'openwa' and c.table_name in ('messages', 'message')
    and c.column_name in ('createdAt', 'created_at', 'timestamp')
    and c.data_type like 'timestamp%'
  order by (c.column_name = 'createdAt') desc, c.column_name limit 1;
  if t is not null then
    execute format('select max(%I) from openwa.%I', col, t) into newest;
  end if;

  insert into ops.health_snapshots (db_size_bytes, table_counts, newest_message_at, probes, ok)
  values (pg_database_size(current_database()), counts, newest, coalesce(p_probes, '{}'::jsonb), p_ok)
  returning * into row_;
  return row_;
end
$fn$;

grant usage on schema ops to health_monitor;
grant insert, select on ops.health_snapshots to health_monitor;
grant execute on function ops.capture_health_snapshot(jsonb, boolean) to health_monitor;

-- Read-only on OpenWA's existing data (future tables: see 20261012120000).
grant usage on schema openwa to health_monitor;
grant select on all tables in schema openwa to health_monitor;
