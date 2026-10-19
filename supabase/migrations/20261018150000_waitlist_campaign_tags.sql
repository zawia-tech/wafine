-- Optional campaign tags on waitlist leads. These are aggregateable source labels, not cookies.
alter table public.waitlist
  add column if not exists source_ref text,
  add column if not exists utm_source text,
  add column if not exists utm_campaign text;
