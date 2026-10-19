# Supabase Postgres CA

Put the project's root certificate here as `supabase-ca.crt`:

Supabase dashboard → **Project Settings → Database → SSL Configuration → Download certificate**.

It is a public CA certificate (not a secret). It is mounted read-only into `openwa-api` as
`NODE_EXTRA_CA_CERTS`, so OpenWA can keep `DATABASE_SSL_REJECT_UNAUTHORIZED=true` and the backup
`pg_dump` can use `sslmode=verify-full`. `stack/preflight.sh` checks that it verifies the pooler.
