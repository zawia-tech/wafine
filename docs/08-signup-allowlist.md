# 08 — Invite-only sign-up, allowlist and admin dashboard

PoC onboarding for the playground web host: a user can create an account only with a WhatsApp number
an admin has put on the allowlist. The number is bound to the account so the later connect-by-QR
step can require that the linked WhatsApp number matches it.

## Flow

```
admin  ──/admin──▶ BFF /api/admin/allowlist ──▶ allowlisted_numbers
user   ──/auth/signup {email,password,phone}──▶ BFF
            phone ∈ allowlist? ─no─▶ 403
            Supabase Auth signUp (anon key) ─▶ user_profiles(user_id, email, phone_e164)
            lost the number race? ─▶ delete the Supabase user (service-role key), 409
user   ──confirm email──▶ /auth/login ──▶ access + refresh token (Supabase JWT)
```

The web app never sees a Supabase key; the BFF proxies sign-up, login and refresh. Only the BFF
holds `SUPABASE_SERVICE_ROLE_KEY` (used solely to roll back a failed sign-up).

## BFF routes

| Route | Auth | What |
|---|---|---|
| `POST /auth/signup` | none, IP-throttled (`AUTH_RATE_LIMIT`/min) | `{email,password,phone}`; 403 if the number is not allowlisted, 409 if the number or email is taken |
| `POST /auth/login` | none, throttled | returns `{accessToken,refreshToken,expiresIn,email,isAdmin}`; 403 until the email is confirmed |
| `POST /auth/refresh` | none, throttled | `{refreshToken}` |
| `GET /api/me` | bearer | `{userId,email,isAdmin,phone}` (`phone` = the bound number) |
| `GET/POST /api/admin/allowlist`, `DELETE /api/admin/allowlist/:phone` | bearer + admin | list (with who added it, when, and the bound email), add, remove |

Missing/invalid bearer → **401** (the global error handler used to turn the middleware's
`HTTPException` into a 500). Non-admin on `/api/admin/*` → **403**.

Removing a number also deletes its binding (FK `ON DELETE CASCADE`); the Supabase login remains but
has no number, so it cannot link a WhatsApp session.

## Numbers

E.164 only (`+` and 7–15 digits). Spaces, dots, dashes, parentheses and a `00` prefix are stripped;
national formats such as `0600000042` are rejected as ambiguous. `normalizeE164` in
`app/bff/src/domain/value-objects/phone.ts` is the single canonicaliser — use it for the QR-link check.

## Admins

`ADMIN_EMAILS` (comma-separated). Admin needs a **confirmed** email, so nobody gets admin by
registering an admin address first. Bootstrap the first invite with `ALLOWLIST_SEED` (comma-separated
E.164, applied idempotently at start-up, recorded as `seed:env`), e.g. the captain's own number.

## Deploy checklist

`stack/compose.infra.yml` forwards the BFF's sign-up config into the container and
`stack/.env.example` documents every placeholder; fill the real values **only** in `stack/.env` on
the VM (never in git). The BFF runs with `NODE_ENV=production`, so it fails fast at start-up and
names the first missing var (check `./stack/wa logs bff`) instead of silently falling back to the
in-memory repository.

Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
`ADMIN_EMAILS`.
- `DATABASE_URL` is the Supabase **session pooler** (`aws-1-eu-west-3.pooler.supabase.com:5432`).
  It must connect as the role that **owns** `allowlisted_numbers` and `user_profiles`: the tables
  have RLS on and no policies, so only the owner (which bypasses RLS) can read or write them.
  `supabase db push` creates them as `postgres`, so use `postgres.<project-ref>`. The `openwa`
  engine role does NOT work here: every query would see zero rows. A dedicated least-privilege
  BFF role (owner of just these tables) is a follow-up.
- `CORS_ORIGINS` stays the web host origin (`https://<web-host>`).
- Optional: `ALLOWLIST_SEED` (e.g. `+212600000042`), `AUTH_RATE_LIMIT`, and `DATABASE_CA_FILE`
  (defaults to `/run/certs/supabase-ca.crt`, the CA the compose file mounts read-only; it pins TLS
  instead of the `ssl: 'require'` fallback).

Migration `supabase/migrations/20261014120000_signup_allowlist.sql` creates `allowlisted_numbers`
and `user_profiles` in `public` with RLS enabled and no policies (PostgREST/anon cannot read them).
Apply it with **`supabase db push`** (confirm the linked project ref in `supabase/.temp/project-ref` first);
it is not applied by CI.
**Never run `bun run db:migrate` / `drizzle-kit migrate` against the remote** — it would create a
second, competing ledger alongside `supabase_migrations.schema_migrations`. The generated
`app/bff/drizzle/0001_last_scrambler.sql` exists only for local dev and the PGlite test that replays
it; it is not the apply path for the remote.

Supabase Auth settings to verify in the dashboard (live changes, deliberately not made here):
- **Authentication → Providers → Email**: enabled, **Confirm email = on**. If it is off, admin status
  still requires a confirmed email, but anyone with an invited number could squat an address.
- **Authentication → URL Configuration**: Site URL `https://<web-host>` (the confirmation
  link redirects there).
- Built-in SMTP is rate-limited (a few mails/hour); fine for a PoC, otherwise configure custom SMTP
  (Brevo is already set up for ai4x.academy).

## Known limits

- Access tokens are resolved with one `GET /auth/v1/user` call per request (no local JWT check, no cache).
- Web session lives in `sessionStorage`; a page that checks `isSessionExpired()` bounces to login
  when the 1 h access token lapses, while `lib/bff.ts` calls refresh transparently.
- Possession of the invited number is not proven at sign-up (no SMS); the connect-by-QR step is the proof.
