-- Keeps archived media out of Postgres.
--
-- OpenWA (v0.24.0) stores every media payload as base64 in openwa.messages.metadata -> media -> data.
-- The chat-media archive (CHAT_MEDIA_ARCHIVE_ENABLED=true, STORAGE_TYPE=s3 -> Cloudflare R2) copies the
-- bytes to object storage and sets "mediaPath", but deliberately LEAVES the inline copy ("doubles
-- storage"). On the Supabase free plan (500 MB) that fills the database within days.
--
-- This trigger drops the inline copy as soon as "mediaPath" is set, i.e. only after the R2 copy and its
-- pointer exist. The row keeps the engine's own "omitted" marker, the shape OpenWA already writes for
-- media it did not store inline (message.service.ts omitInlineMedia), so every reader keeps working:
--   * GET .../:messageId/media serves the archive first (message.service.ts getChatMedia)
--   * message lists already tolerate { omitted: true, sizeBytes }
--
-- "metadata" is a plain text column on Postgres (simple-json, never jsonb), hence the casts. A value
-- that is not valid jsonb (for example one holding a NUL escape) is left untouched. Media still inline
-- because the archive was off, failed, or the file was over CHAT_MEDIA_ARCHIVE_MAX_BYTES is also left
-- untouched: nothing is deleted unless a stored object exists.
--
-- Idempotent. Skipped silently while OpenWA has not created the table yet (it creates its own tables
-- at boot); re-apply this migration after the first boot in that case.

create or replace function openwa.strip_archived_media()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  m jsonb;
  d text;
begin
  if new."mediaPath" is null or new.metadata is null then
    return new;
  end if;
  -- cheap pre-filter before parsing a possibly multi-megabyte value
  if position('"data"' in new.metadata) = 0 then
    return new;
  end if;
  -- a trigger error would fail the write OpenWA is making, so any problem leaves the row untouched
  begin
    m := new.metadata::jsonb;
    d := m #>> '{media,data}';
    -- no payload, or a URL pointer (URL-based sends store the URL string as data)
    if d is null or d = '' or d ~* '^https?://' then
      return new;
    end if;
    new.metadata := jsonb_set(
      m,
      '{media}',
      ((m -> 'media') - 'data') || jsonb_build_object(
        'omitted', true,
        'sizeBytes', coalesce(
          nullif(m #>> '{media,sizeBytes}', '')::bigint,
          (length(d) * 3 / 4) - case when d like '%==' then 2 when d like '%=' then 1 else 0 end
        )
      )
    )::text;
  exception when others then
    return new;
  end;
  return new;
end;
$$;

do $$
begin
  if to_regclass('openwa.messages') is null then
    raise notice 'openwa.messages does not exist yet: start OpenWA once, then re-apply this migration';
    return;
  end if;
  drop trigger if exists strip_archived_media on openwa.messages;
  create trigger strip_archived_media
    before insert or update of "mediaPath", metadata on openwa.messages
    for each row
    execute function openwa.strip_archived_media();
end $$;
