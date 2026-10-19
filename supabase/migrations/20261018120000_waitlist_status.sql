-- Admin backoffice: waitlist status, so an admin can see the waitlist and invite a lead in one
-- click (GET /admin/waitlist, POST /admin/waitlist/:id/invite in app/bff/.../routes/admin.ts).
--
-- Apply with `supabase db push` (the single migration path). The matching Drizzle schema is
-- app/bff/src/infrastructure/db/schema/index.ts; app/bff/drizzle/0006_waitlist_status.sql is the
-- local artifact the PGlite test replays, not the remote apply path.
--
-- Additive and re-runnable: rows that already exist become `pending`, because nothing has invited
-- them through the backoffice yet. Only the BFF writes the column, and only after the entry's
-- number has been added to `allowlisted_numbers`; inviting twice leaves `invited` in place.

alter table public.waitlist add column if not exists status text not null default 'pending';
