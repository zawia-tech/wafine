variable "oci_profile" {
  description = "Profile in ~/.oci/config"
  type        = string
  default     = "DEFAULT"
}

variable "tenancy_ocid" {
  description = "Root compartment; `oci iam compartment list --all --query 'data[0].\"compartment-id\"' --raw-output`, or `tenancy=` in ~/.oci/config"
  type        = string
}

variable "region" {
  description = "OCI region identifier, e.g. af-casablanca-1 (Morocco West). Always Free resources only exist in your HOME region."
  type        = string
}

variable "compartment_ocid" {
  description = "Existing compartment for all resources. Empty = create 'wa-infra' under the tenancy root."
  type        = string
  default     = ""
}

variable "name" {
  description = "Prefix for resource names and the Tailscale hostname."
  type        = string
  default     = "wafine-vm"
}

variable "shape" {
  description = "VM.Standard.A1.Flex (Ampere ARM; Always Free = 2 OCPU / 12 GB in total since June 2026) or VM.Standard.E5.Flex (AMD, paid)."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  type    = number
  default = 2
}

variable "memory_gbs" {
  type    = number
  default = 12
}

variable "boot_volume_gbs" {
  description = "Always Free includes 200 GB of block storage in total (boot + block volumes)."
  type        = number
  default     = 100
}

variable "ssh_public_key" {
  description = "Break-glass key for the 'ubuntu' user. Day-to-day access is Tailscale SSH."
  type        = string
}

variable "admin_cidr" {
  description = "Optional CIDR allowed to reach port 22 directly (e.g. your office IP/32). Empty = no inbound rules at all."
  type        = string
  default     = ""
}

variable "tailscale_auth_key" {
  description = "Tagged, pre-approved Tailscale auth key (tag:server). Consumed once by cloud-init."
  type        = string
  sensitive   = true
  validation {
    condition     = can(regex("^tskey-", var.tailscale_auth_key))
    error_message = "Generate a key in the Tailscale admin console (Settings > Keys): one-off, pre-approved, tag:server."
  }
}

variable "tailscale_direct_udp" {
  description = "Open UDP 41641 inbound (security list + host iptables) so Tailscale peers connect directly instead of via DERP relays. Tailscale's OCI guide recommends it; it is the one exception to zero-inbound."
  type        = bool
  default     = false
}

variable "vcn_cidr" {
  type    = string
  default = "10.42.0.0/16"
}
