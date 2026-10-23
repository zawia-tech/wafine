# API edge (Vercel proxy for the BFF)

The public API host (`api.<your-domain>`) is a tiny Vercel project with no code. Its
`vercel.json` rewrites every path to the BFF on the VM, published through
**Tailscale Funnel** on port 8443:

```
client ─► api.<your-domain> (Vercel) ─► https://<vm>.<tailnet>.ts.net:8443 (Funnel) ─► BFF 127.0.0.1:4000
```

The VM still opens no inbound port: Funnel reaches it through Tailscale's relays. The
OpenWA gateway stays tailnet-only (port 443 on the same host is `tailscale serve`, not
Funnel).

## Why this shape

The production zone keeps its nameservers at the registrar, and a Cloudflare Tunnel only
serves hostnames inside its own Cloudflare zone. Funnel gives the VM a public HTTPS name
without opening a port, and Vercel puts that name behind the production domain.

## Prerequisites

1. Tailnet policy allows Funnel for the server tag:
   ```hujson
   "nodeAttrs": [{"target": ["tag:server"], "attr": ["funnel"]}],
   ```
2. On the VM, once (the setting survives reboots and deploys):
   ```bash
   sudo tailscale funnel --bg --https=8443 http://127.0.0.1:4000
   ```
   The first time, Tailscale can take a while to publish the public DNS name. If
   `dig +short <vm>.<tailnet>.ts.net @1.1.1.1` stays empty after ten minutes, turn Funnel
   off and on again (`tailscale funnel --https=8443 off`, then the command above).
3. The VM's `stack/.env` has `PUBLIC_API_URL=https://api.<your-domain>`, so OAuth metadata
   names the public host. `CLOUDFLARE_TUNNEL_TOKEN` stays empty.

## Deploy

```bash
cd app/api-edge
vercel link --project wafine-api
vercel deploy --prod
```

Attach the domain once: add `api.<your-domain>` to the project, add the `_vercel` TXT record
Vercel asks for, and point a CNAME at `cname.vercel-dns.com.` at the registrar.

The web app reaches the API through its own same-origin proxy: set `BFF_URL` and
`NEXT_PUBLIC_API_URL` in the web project to `https://api.<your-domain>` and redeploy web.

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.<your-domain>/health      # 200
curl -s -o /dev/null -w '%{http_code}\n' https://api.<your-domain>/api/me      # 401
curl -s https://api.<your-domain>/.well-known/oauth-authorization-server       # issuer = https://api.<your-domain>
make go-live-check WEB_URL=https://<web-host> API_URL=https://api.<your-domain> DOCS_URL=https://<docs-host>
```

A `502` with `x-vercel-error: DNS_HOSTNAME_NOT_FOUND` means Vercel cannot resolve the Funnel
name yet: check public DNS for it (prerequisite 2).

## Rollback

Point the web project's `BFF_URL` and `NEXT_PUBLIC_API_URL` at another API host and redeploy
web, then turn Funnel off on the VM: `sudo tailscale funnel --https=8443 off`.
