variable "cloudflare_api_token" {
  description = "API token with: Account > Cloudflare Tunnel:Edit, Zone > DNS:Edit. Add Account > Access: Apps and Policies:Edit + Access: Service Tokens:Edit when gateway_public = true."
  type        = string
  sensitive   = true
}

variable "account_id" { type = string }
variable "zone_id" { type = string }

variable "zone_name" {
  description = "Your domain as it exists in Cloudflare, e.g. example.ma"
  type        = string
}

# Subdomains are first-level labels only (Universal SSL does not cover a.b.example.ma).
variable "gateway_subdomain" {
  description = "OpenWA gateway hostname label (tunnel, behind Access; only when gateway_public)."
  type        = string
  default     = "gw"
}

variable "gateway_public" {
  description = "Publish the gateway on gw.<zone> behind Cloudflare Access (ingress rules, DNS record, Access app, service token). Needs Zero Trust enabled on the account. Off = tailnet-only."
  type        = bool
  default     = false
}

variable "api_public" {
  description = "Create the proxied api.<zone> CNAME to the tunnel (the ingress rule always exists). Flip to true only after the sign-up PR (real Supabase JWT auth, tenant from the verified user) is on main. Off = the BFF stays unreachable from the internet."
  type        = bool
  default     = false
}

variable "api_subdomain" {
  description = "BFF hostname label (tunnel)."
  type        = string
  default     = "api"
}

variable "web_subdomain" {
  description = "Web app hostname label (Vercel, DNS-only CNAME)."
  type        = string
  default     = "wa"
}

variable "web_cname_target" {
  description = "CNAME target Vercel recommends for the web hostname: `vercel domains inspect <web fqdn>` or the project's Domains page."
  type        = string
}

variable "tunnel_name" {
  type    = string
  default = "wafine-vm"
}

variable "access_emails" {
  description = "Operators allowed through Cloudflare Access (email one-time PIN). Only used when gateway_public = true."
  type        = list(string)
  default     = []
}

variable "r2_media_bucket_name" {
  description = "R2 bucket for OpenWA media storage."
  type        = string
  default     = "openwa-media"
}

variable "r2_backups_bucket_name" {
  description = "R2 bucket for OpenWA backups."
  type        = string
  default     = "openwa-backups"
}

variable "r2_location" {
  description = "R2 bucket location/jurisdiction. Valid: apac, eeur, enam, weur, wnam, oc, afr."
  type        = string
  default     = "eeur"
}

variable "docs_subdomain" {
  description = "Docs site hostname label (Vercel project `docs`, DNS-only CNAME, HTTP Basic Auth in the app)."
  type        = string
  default     = "docs"
}

variable "docs_cname_target" {
  description = "CNAME target Vercel recommends for the docs hostname (`vercel api /v6/domains/<fqdn>/config`). Empty = no record."
  type        = string
  default     = ""
}

variable "docs_vercel_verify" {
  description = "Value of the `_vercel` TXT challenge Vercel issues for the docs hostname (the apex belongs to another Vercel account). Empty = no record."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Cloudflare for SaaS: API hostnames that live in a zone we do NOT manage.
# Everything below is inert while custom_hostnames is empty (the default), so
# `scripts/tf cloudflare plan` keeps showing no diff until it is filled in.
# ---------------------------------------------------------------------------
variable "custom_hostnames" {
  description = "API hostnames to publish through Cloudflare for SaaS. Each becomes a custom hostname on the account, the zone gets one proxied fallback-origin CNAME, and the tunnel gets one ingress rule to the BFF per hostname. The DNS records themselves live at the DNS holder: read them from the custom_hostname_dns output and hand them over. Empty = nothing is created."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for h in var.custom_hostnames :
      can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", h))
    ])
    error_message = "custom_hostnames entries must be lowercase FQDNs, e.g. api.example.com."
  }
}

variable "custom_hostname_ssl_method" {
  description = "Domain control validation method for the custom hostnames. txt = the DNS holder adds one TXT record per hostname (the right choice for a zone we do not manage)."
  type        = string
  default     = "txt"

  validation {
    condition     = contains(["txt", "http", "email"], var.custom_hostname_ssl_method)
    error_message = "custom_hostname_ssl_method must be one of: txt, http, email."
  }
}

variable "fallback_origin_subdomain" {
  description = "Label of the proxied fallback-origin CNAME in this zone — the CNAME target the DNS holder uses. Only used when custom_hostnames is non-empty."
  type        = string
  default     = "origin"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.fallback_origin_subdomain))
    error_message = "fallback_origin_subdomain must be a single DNS label, e.g. origin."
  }
}

variable "r2_jurisdiction" {
  description = "R2 jurisdiction for the media and backups buckets. \"eu\" keeps the data in the EU and requires the https://<account_id>.eu.r2.cloudflarestorage.com endpoint (S3_ENDPOINT). Changing it on an existing bucket replaces the bucket."
  type        = string
  default     = "eu"

  validation {
    condition     = contains(["default", "eu", "fedramp"], var.r2_jurisdiction)
    error_message = "r2_jurisdiction must be default, eu or fedramp."
  }
}

variable "vercel_extra_hosts" {
  description = "Extra Vercel hostnames in this zone: map of subdomain (relative to zone_name) to its Vercel CNAME target and the value of its _vercel verification TXT (empty if Vercel does not ask). Real values live in terraform.tfvars only."
  type = map(object({
    cname_target = string
    verify_txt   = optional(string, "")
  }))
  default = {}
}
