output "gateway_url" {
  description = "Public gateway URL, or null while the gateway is tailnet-only."
  value       = var.gateway_public ? "https://${local.gateway_fqdn}" : null
}

output "api_url" {
  description = "Public BFF URL, or null while api_public = false."
  value       = var.api_public ? "https://${local.api_fqdn}" : null
}

output "web_url" {
  value = "https://${local.web_fqdn}"
}

output "tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.wa.id
}

# scripts/tf cloudflare output -raw tunnel_token   -> CLOUDFLARE_TUNNEL_TOKEN in stack/.env on the VM
output "tunnel_token" {
  value     = data.cloudflare_zero_trust_tunnel_cloudflared_token.wa.token
  sensitive = true
}

# Give these to integrations (n8n, backends) together with an OpenWA API key.
output "access_client_id" {
  value = one(cloudflare_zero_trust_access_service_token.integrations[*].client_id)
}

output "access_client_secret" {
  value     = one(cloudflare_zero_trust_access_service_token.integrations[*].client_secret)
  sensitive = true
}

output "r2_media_bucket_name" {
  value = cloudflare_r2_bucket.media.name
}

output "r2_backups_bucket_name" {
  value = cloudflare_r2_bucket.backups.name
}

output "r2_endpoint" {
  description = "S3-compatible endpoint for R2 (EU jurisdiction)."
  value       = "https://${var.account_id}.eu.r2.cloudflarestorage.com"
}

output "docs_url" {
  description = "Docs site URL, or null until docs_cname_target is set."
  value       = var.docs_cname_target == "" ? null : "https://${var.docs_subdomain}.${var.zone_name}"
}

# ---------------------------------------------------------------------------
# Cloudflare for SaaS handover sheet (docs/15-launch-checklist.md, option A).
# The DNS records live in a zone we do not manage, so they are added by hand:
#   scripts/tf cloudflare output -json custom_hostname_dns
# Values are unknown until the apply that creates the custom hostnames.
# ---------------------------------------------------------------------------
output "custom_hostname_dns" {
  description = "Per custom hostname: the CNAME the DNS holder adds, the ownership TXT, and the certificate (DCV) records to paste. Empty while custom_hostnames is empty."
  value = {
    for hostname in var.custom_hostnames : hostname => {
      cname = {
        name   = hostname
        type   = "CNAME"
        target = "${var.fallback_origin_subdomain}.${var.zone_name}"
      }
      ownership_txt = {
        name  = cloudflare_custom_hostname.this[hostname].ownership_verification.name
        type  = cloudflare_custom_hostname.this[hostname].ownership_verification.type
        value = cloudflare_custom_hostname.this[hostname].ownership_verification.value
      }
      ssl_validation_records = [
        for record in try(data.cloudflare_custom_hostname.this[hostname].ssl.validation_records, []) : {
          txt_name     = record.txt_name
          txt_value    = record.txt_value
          cname        = record.cname
          cname_target = record.cname_target
        }
      ]
    }
  }
}

output "custom_hostname_fallback_origin" {
  description = "Fallback origin the custom-hostname CNAMEs point at, or null while custom_hostnames is empty."
  value       = length(var.custom_hostnames) > 0 ? "${var.fallback_origin_subdomain}.${var.zone_name}" : null
}
