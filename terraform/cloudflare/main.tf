terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.8.2, < 6.0.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  # gw  = OpenWA gateway (dashboard + REST + Socket.IO) via the tunnel, behind Access.
  #       OFF by default (var.gateway_public = false): no ingress rule, no DNS record, no Access
  #       app, so the gateway is tailnet-only. Flip the variable once Zero Trust is enabled.
  # api = BFF via the tunnel. The ingress rule always exists; the DNS record is created only
  #       when var.api_public = true (after the sign-up PR lands real auth in the BFF).
  # wa  = web app on Vercel: DNS-only CNAME, not a tunnel hostname
  gateway_fqdn = "${var.gateway_subdomain}.${var.zone_name}"
  api_fqdn     = "${var.api_subdomain}.${var.zone_name}"
  web_fqdn     = "${var.web_subdomain}.${var.zone_name}"
}

# ---------------------------------------------------------------------------
# Remotely-managed tunnel: ingress rules live in Cloudflare, the VM only needs the token.
# ---------------------------------------------------------------------------
resource "cloudflare_zero_trust_tunnel_cloudflared" "wa" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare"
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "wa" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.wa.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "wa" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.wa.id
  config = {
    ingress = concat(
      # Gateway rules exist only while the gateway is public (var.gateway_public).
      var.gateway_public ? [
        # OpenWA's MCP endpoint is for agents on the tailnet only (OpenWA docs: never expose /mcp publicly).
        {
          hostname = local.gateway_fqdn
          path     = "^/mcp"
          service  = "http_status:404"
        },
      ] : [],
      [
        # BFF API -> BFF:4000
        {
          hostname = local.api_fqdn
          service  = "http://openwa-bff:4000"
        },
      ],
      # Cloudflare for SaaS custom hostnames (var.custom_hostnames): requests arrive with
      # the custom Host header, so each hostname needs its own rule before the catch-all.
      # Empty while the list is empty, so the tunnel config does not change. api.<zone>
      # is dropped when it is already served by the rule above.
      [
        for hostname in var.custom_hostnames : {
          hostname = hostname
          service  = "http://openwa-bff:4000"
        } if hostname != local.api_fqdn
      ],
      var.gateway_public ? [
        # Dashboard + REST API + Socket.IO, reached over the compose network (no published host port).
        {
          hostname = local.gateway_fqdn
          service  = "http://openwa-api:2785"
        },
      ] : [],
      [
        {
          service = "http_status:404"
        },
      ],
    )
  }
}

resource "cloudflare_dns_record" "gateway" {
  count   = var.gateway_public ? 1 : 0
  zone_id = var.zone_id
  name    = var.gateway_subdomain
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.wa.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
  comment = "OpenWA gateway via Cloudflare Tunnel (managed by terraform/cloudflare)"
}

# BFF via the tunnel. The ingress rule above is unconditional; this record is the publish
# switch (var.api_public). No record = api.<zone> does not resolve = the BFF stays private.
resource "cloudflare_dns_record" "api" {
  count   = var.api_public ? 1 : 0
  zone_id = var.zone_id
  name    = var.api_subdomain
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.wa.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
  comment = "BFF via Cloudflare Tunnel (managed by terraform/cloudflare)"
}

# The web app lives on Vercel, which terminates TLS itself, so the record must stay
# DNS-only: a proxied record would break Vercel's certificate issuance.
# This is the record that used to point wa at the tunnel; it is updated in place.
resource "cloudflare_dns_record" "wa" {
  zone_id = var.zone_id
  name    = var.web_subdomain
  type    = "CNAME"
  content = var.web_cname_target
  proxied = false
  ttl     = 1
  comment = "Web app on Vercel (managed by terraform/cloudflare)"
}

# Docs site on Vercel (password protected by the app's own Basic Auth). DNS-only like `wa`,
# so Vercel can issue the certificate. Both records exist only once their values are set.
resource "cloudflare_dns_record" "docs" {
  count   = var.docs_cname_target == "" ? 0 : 1
  zone_id = var.zone_id
  name    = var.docs_subdomain
  type    = "CNAME"
  content = var.docs_cname_target
  proxied = false
  ttl     = 1
  comment = "Docs site on Vercel, Basic Auth (managed by terraform/cloudflare)"
}

resource "cloudflare_dns_record" "docs_vercel_verify" {
  count   = var.docs_vercel_verify == "" ? 0 : 1
  zone_id = var.zone_id
  name    = "_vercel"
  type    = "TXT"
  content = "\"${var.docs_vercel_verify}\""
  proxied = false
  ttl     = 1
  comment = "Vercel domain verification for the docs hostname (managed by terraform/cloudflare)"
}

# Extra Vercel hostnames in this zone (for example a renamed web or docs host while the old
# one keeps working). DNS-only CNAMEs so Vercel issues the certificates, plus one `_vercel`
# TXT per host for Vercel's domain verification. Empty by default: no change.
resource "cloudflare_dns_record" "vercel_extra_cname" {
  for_each = var.vercel_extra_hosts
  zone_id  = var.zone_id
  name     = each.key
  type     = "CNAME"
  content  = each.value.cname_target
  proxied  = false
  ttl      = 1
  comment  = "Vercel host ${each.key} (managed by terraform/cloudflare)"
}

resource "cloudflare_dns_record" "vercel_extra_verify" {
  for_each = { for k, v in var.vercel_extra_hosts : k => v if v.verify_txt != "" }
  zone_id  = var.zone_id
  name     = "_vercel"
  type     = "TXT"
  content  = "\"${each.value.verify_txt}\""
  proxied  = false
  ttl      = 1
  comment  = "Vercel domain verification for ${each.key} (managed by terraform/cloudflare)"
}

# ---------------------------------------------------------------------------
# Cloudflare for SaaS: API hostnames in a zone we do NOT manage (the DNS holder
# keeps its own registrar/nameservers; nothing about its mail or site changes).
#   DNS holder -> CNAME <api-host>  <fallback-origin>.<zone>
#   Cloudflare -> fallback origin -> this same tunnel -> ingress rule above -> openwa-bff:4000
# Everything here is created only while var.custom_hostnames is non-empty, so the
# default `scripts/tf cloudflare plan` has no diff.
# ---------------------------------------------------------------------------
resource "cloudflare_dns_record" "custom_hostname_fallback" {
  count   = length(var.custom_hostnames) > 0 ? 1 : 0
  zone_id = var.zone_id
  name    = var.fallback_origin_subdomain
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.wa.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
  comment = "Cloudflare for SaaS fallback origin (managed by terraform/cloudflare)"
}

resource "cloudflare_custom_hostname_fallback_origin" "this" {
  count   = length(var.custom_hostnames) > 0 ? 1 : 0
  zone_id = var.zone_id
  origin  = "${var.fallback_origin_subdomain}.${var.zone_name}"

  # The origin must resolve in this zone before Cloudflare accepts it.
  depends_on = [cloudflare_dns_record.custom_hostname_fallback]
}

resource "cloudflare_custom_hostname" "this" {
  for_each = toset(var.custom_hostnames)
  zone_id  = var.zone_id
  hostname = each.value

  ssl = {
    method = var.custom_hostname_ssl_method
    type   = "dv"
  }

  depends_on = [cloudflare_custom_hostname_fallback_origin.this]
}

# The resource exposes the ownership record but not the certificate (DCV) records, so
# read each hostname back once it exists. depends_on defers the read to apply: without
# it OpenTofu looks the hostname up during plan, before it has been created.
data "cloudflare_custom_hostname" "this" {
  for_each = toset(var.custom_hostnames)
  zone_id  = var.zone_id

  filter = {
    hostname = {
      exact = each.value
    }
  }

  depends_on = [cloudflare_custom_hostname.this]
}

# ---------------------------------------------------------------------------
# Cloudflare Access in front of the whole gateway hostname (created only when var.gateway_public):
#   humans   -> email one-time PIN (only the listed addresses ever receive a code)
#   machines -> service token headers CF-Access-Client-Id / CF-Access-Client-Secret
# OpenWA's own X-API-Key is still required behind it.
# ---------------------------------------------------------------------------
resource "cloudflare_zero_trust_access_service_token" "integrations" {
  count      = var.gateway_public ? 1 : 0
  account_id = var.account_id
  name       = "${var.tunnel_name}-integrations"
  duration   = "8760h"
}

resource "cloudflare_zero_trust_access_policy" "humans" {
  count      = var.gateway_public ? 1 : 0
  account_id = var.account_id
  name       = "${var.tunnel_name} operators"
  decision   = "allow"
  include    = [for e in var.access_emails : { email = { email = e } }]
}

resource "cloudflare_zero_trust_access_policy" "machines" {
  count      = var.gateway_public ? 1 : 0
  account_id = var.account_id
  name       = "${var.tunnel_name} service token"
  decision   = "non_identity"
  include = [{
    service_token = { token_id = cloudflare_zero_trust_access_service_token.integrations[0].id }
  }]
}

resource "cloudflare_zero_trust_access_application" "wa" {
  count            = var.gateway_public ? 1 : 0
  account_id       = var.account_id
  type             = "self_hosted"
  name             = "OpenWA ${local.gateway_fqdn}"
  domain           = local.gateway_fqdn
  session_duration = "12h"
  policies = [
    { id = cloudflare_zero_trust_access_policy.machines[0].id, precedence = 1 },
    { id = cloudflare_zero_trust_access_policy.humans[0].id, precedence = 2 },
  ]
}

# ---------------------------------------------------------------------------
# R2 buckets for media and backups (EU jurisdiction: data stays in the EU, and the
# bucket is only reachable on the .eu. endpoint below; `location` alone is just a hint).
# The S3-compatible endpoint is https://<account_id>.eu.r2.cloudflarestorage.com
# ---------------------------------------------------------------------------
resource "cloudflare_r2_bucket" "media" {
  account_id   = var.account_id
  name         = var.r2_media_bucket_name
  location     = var.r2_location
  jurisdiction = var.r2_jurisdiction
}

resource "cloudflare_r2_bucket" "backups" {
  account_id   = var.account_id
  name         = var.r2_backups_bucket_name
  location     = var.r2_location
  jurisdiction = var.r2_jurisdiction
}
