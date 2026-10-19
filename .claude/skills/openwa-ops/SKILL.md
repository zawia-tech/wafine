---
name: openwa-ops
description: Build, deploy, and operate the OpenWA WhatsApp gateway (rmyndharis/OpenWA, built from the source checkout in ./OpenWA) on the OCI VM — compose wrapper, sessions and QR linking, API keys, webhooks, MCP, upgrades, backups and troubleshooting. Use for anything about OpenWA, WhatsApp sessions/numbers, QR codes, sending messages, webhooks, or the openwa-api container.
---

# OpenWA operations

Source of truth for OpenWA behaviour is the checkout itself: `OpenWA/README.md`, `OpenWA/.env.example`, `OpenWA/docs/` (06 API, 11 runbooks, 12 FAQ, 16 risk, 24 MCP). Read the relevant doc before improvising. Do not use open-wa/wa-automate docs; that is a different project.

## Layout on the VM (`/opt/wa`)
- `OpenWA/`: upstream source, **unmodified**. The image is built from `OpenWA/Dockerfile`, multi-arch (Debian chromium on arm64).
- `stack/compose.infra.yml`: our override. It adds cloudflared, the **BFF** (`app/bff`) + Valkey/redis, disables docker-socket-proxy, and mounts the Supabase CA.
- `stack/.env`: runtime config. It lives only on the VM.
- `stack/wa`: **always use it** instead of raw `docker compose`. It runs `-p openwa --env-file stack/.env -f OpenWA/docker-compose.yml -f stack/compose.infra.yml`.

## Everyday commands (on the VM: `ssh ubuntu@wafine-vm`)
```bash
cd /opt/wa
./stack/wa                        # ps
./stack/wa logs -f --tail=200 openwa-api
./stack/wa restart openwa-api
./stack/wa apikey                 # bootstrap admin key (first boot only), then store it and remove the file
```
From the Mac: `scripts/deploy.sh` syncs the source, runs the preflight, builds, starts, installs the backup cron and enables Tailscale Serve.

## API basics (port 2785, header `X-API-Key`)
Reach it on the tailnet at `https://<host>.<tailnet>.ts.net`. Publicly (only when terraform `gateway_public = true`) it is at `https://gw.<domain>`, which also requires the Cloudflare Access headers `CF-Access-Client-Id` / `CF-Access-Client-Secret`.
```bash
curl -X POST $BASE/api/sessions -H "X-API-Key: $K" -H 'Content-Type: application/json' -d '{"name":"sales-ma"}'
curl -X POST $BASE/api/sessions/$SID/start -H "X-API-Key: $K"
curl $BASE/api/sessions/$SID/qr -H "X-API-Key: $K"          # QR valid ~60 s
curl -X POST $BASE/api/sessions/$SID/messages/send-text -H "X-API-Key: $K" -H 'Content-Type: application/json' \
  -d '{"chatId":"2126XXXXXXXX@c.us","text":"Salam"}'
curl -X POST $BASE/api/sessions/$SID/webhooks -H "X-API-Key: $K" -H 'Content-Type: application/json' \
  -d '{"url":"https://hooks.example.ma/wa","events":["message.received","session.status"],"secret":"<hmac>"}'
```
Moroccan numbers: `212` + 9 digits without the leading 0, e.g. `212612345678@c.us`.

## Keys and MCP
- Mint least-privilege keys: operator or viewer, scoped with `allowedSessions` and, when possible, `allowedChats`. Never hand the admin key to an integration or an agent.
- MCP is mounted at `/mcp` (`MCP_ENABLED=true`, `MCP_READONLY=true` by default). Cloudflare returns 404 for `/mcp`, so it is reachable only over Tailscale. `.mcp.json` points Claude Code at `${OPENWA_MCP_URL}` with `${OPENWA_MCP_KEY}`.
- Write tools (send, group ops) need `MCP_READONLY=false`. Ask the user before flipping it.

## Guardrails (ban risk is real — OpenWA README "Before you connect a number")
- Never link the user's primary personal or business number. Use a dedicated, warmed-up number.
- Keep `SEND_PACING_ENABLED=true`. No cold blasts to non-opted-in recipients.
- Pairing-code linking on whatsapp-web.js can revoke an already linked device. Link by QR.
- Do not log out or re-link a working session casually: some accounts hit a passkey gate on re-link.

## Upgrades
```bash
git -C OpenWA fetch --tags && git -C OpenWA checkout v<version>   # on the Mac
scripts/deploy.sh                                                  # back up first: ssh … /opt/wa/stack/backup.sh
```
Read `OpenWA/CHANGELOG.md` and the "Known Upgrade Hazards" in `OpenWA/docs/14-migration-guide.md` before you bump the version.

## Backups
`stack/backup.sh` runs nightly via cron. It archives `/app/data` (main.sqlite API keys and audit, WhatsApp auth state, plugins) and dumps the `openwa` schema, then uploads both to Supabase bucket `openwa-backups/<host>/`. Upstream `scripts/backup.sh` is NOT used: its unscoped `pg_dump` fails under the least-privilege Supabase role.

## Troubleshooting quick map
| Symptom | First check |
|---|---|
| openwa-api unhealthy at boot | `./stack/wa logs openwa-api`; DB TLS or search_path → rerun `./stack/preflight.sh` |
| 502/1033 on the public hostname | `./stack/wa ps` (cloudflared healthy?), `docker logs openwa-cloudflared` |
| Session stuck at `qr_ready` | `OpenWA/docs/12-troubleshooting-faq.md` (passkey gate, expired QR) |
| Chromium crashes / OOM | `OPENWA_MEM_LIMIT`, session count (~300–500 MB each on whatsapp-web.js) |
