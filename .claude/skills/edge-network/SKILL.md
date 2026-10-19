---
name: edge-network
description: Manage the network edge of this stack — Cloudflare Tunnel (remotely-managed, our own domain instead of generated trycloudflare/ngrok links), Cloudflare Access (email OTP + service tokens), DNS, and Tailscale (host install, Tailscale SSH, Serve, tags/ACLs). Use for domains, hostnames, tunnels, 502/1033 errors, Access prompts, tailnet reachability, or "how do I reach the VM".
---

# Edge network: Cloudflare + Tailscale

## Model
```
Internet ──► Cloudflare edge (TLS, Access) ──► tunnel ──► cloudflared ──► openwa-api:2785   (gw.<your-domain>: dashboard + API)
                                                                    └──► openwa-bff:4000   (api.<your-domain> ingress; no DNS record in Terraform)
Browser ──► Vercel (web host, DNS-only CNAME) ──► app/web
Operators/agents ──► Tailscale ──► wafine-vm (host tailscaled)
     ├── Tailscale SSH (port 22 on the tailnet IP only)
     └── tailscale serve https://<host>.<tailnet>.ts.net ──► 127.0.0.1:2785   (dashboard + /mcp)
OCI security list: NO TCP/UDP ingress. Both connectors only dial out.
```

## Cloudflare (Terraform: `terraform/cloudflare/`, provider v5)
- Remotely-managed tunnel (`config_src = "cloudflare"`). The VM only holds `CLOUDFLARE_TUNNEL_TOKEN` (`scripts/tf cloudflare output -raw tunnel_token`).
- Ingress order matters: `^/mcp` on the gateway hostname returns 404, then `api` → `http://openwa-bff:4000`, then the gateway hostname → `http://openwa-api:2785`, then a `http_status:404` catch-all.
- Hostnames: `gateway_subdomain` (`gw`), `api_subdomain` (`api`), `web_subdomain` (`wa`, a **DNS-only** CNAME to Vercel's target in `web_cname_target`; proxying it breaks Vercel's TLS). `wa` is not a tunnel hostname. The gateway's DNS record, ingress rules and Access app exist only when `gateway_public = true` (the default keeps the gateway tailnet-only).
- Hostnames must be **first-level** (`gw.example.ma`). Universal SSL doesn't cover `a.b.example.ma`.
- Access app on the gateway hostname:
  - humans → email one-time PIN for the `access_emails` list;
  - machines → service token (`decision = "non_identity"`), sending headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`, plus OpenWA's `X-API-Key`.
- Adding another public hostname means one more ingress rule + `cloudflare_dns_record` (proxied CNAME to `<tunnel-id>.cfargotunnel.com`) + Access app. Do it in Terraform, not the dashboard.
- Inbound webhooks from third parties that can't send Access headers need a separate hostname or path with its own Access policy (`bypass`) **and** HMAC verification in the app. Ask before creating any bypass.

Debug:
```bash
ssh ubuntu@wafine-vm 'docker logs --tail=100 openwa-cloudflared'
ssh ubuntu@wafine-vm 'docker inspect -f "{{.State.Health.Status}}" openwa-cloudflared'
curl -sI https://gw.<domain>                     # expect 302 to Access login
curl -s https://gw.<domain>/api/health/ready -H "CF-Access-Client-Id: $ID" -H "CF-Access-Client-Secret: $SECRET"
```
Error 1033 means no connector is up (cloudflared down or wrong token). 502 means the connector is up but openwa-api is unreachable or unhealthy.

## Tailscale
- tailscaled runs on the **host**, installed by cloud-init with `--ssh --advertise-tags=tag:server`. Tagged nodes have key expiry disabled by default.
- Auth key for cloud-init: one-off, pre-approved, tagged `tag:server`, short expiry.
- Minimal policy (tailnet admin → Access controls):
```jsonc
{
  "tagOwners": { "tag:server": ["autogroup:admin"] },
  "grants":    [{ "src": ["autogroup:admin"], "dst": ["tag:server"], "ip": ["*"] }],
  "ssh":       [{ "action": "accept", "src": ["autogroup:admin"], "dst": ["tag:server"], "users": ["ubuntu", "root"] }]
}
```
- Serve needs MagicDNS + HTTPS certificates enabled for the tailnet. Funnel is NOT used: it only works on Tailscale-issued hostnames, and Cloudflare already covers public access.
- Alignment with Tailscale's OCI guide (tailscale.com/docs/install/cloud/oracle-cloud):
  - `--accept-dns=false` on the VM: adopted. Oracle's resolver keeps handling DNS.
  - UDP 41641 inbound for direct connections: the `tailscale_direct_udp` toggle, **off** by default (DERP relay, zero inbound). Setting it to `true` opens the security list **and** inserts an iptables ACCEPT ahead of OCI's REJECT, and it's applied only at first boot by cloud-init. On an existing VM, run `sudo iptables -I INPUT -p udp --dport 41641 -j ACCEPT && sudo netfilter-persistent save`, then restart Docker.
  - `--advertise-routes=<subnet>,169.254.169.254/32` + split DNS for `oraclevcn.com`: **deliberately not used**. There's one VM, so nothing needs routing, and exposing instance metadata (instance-principal credentials) to the tailnet is an escalation path.
- For more than one server, replace hand-made auth keys with an OAuth client (`auth_keys` scope, tag `tag:server`), or have the Tailscale Terraform provider mint them.

Debug:
```bash
tailscale status
tailscale ping wafine-vm
ssh ubuntu@wafine-vm 'tailscale serve status; tailscale netcheck'
```
