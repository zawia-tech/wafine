variable "region" {
  description = <<-EOT
    AWS region. us-east-1 is the default only because ~/.aws/config already
    names it. LATENCY NOTE: this box serves Morocco; us-east-1 is ~100-120 ms
    away, eu-west-3 (Paris) or eu-south-2 (Spain) are ~30-45 ms. T4g is
    available in both. Prefer a European region for a WhatsApp gateway, where
    every message round-trip is user-visible.
  EOT
  type        = string
  default     = "us-east-1"
}

variable "availability_zone" {
  description = "AZ for the subnet. Empty = first AZ in the region. Pin it so the subnet never moves."
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment tag. This module is meant for staging, not production."
  type        = string
  default     = "staging"
}

variable "name" {
  description = "Prefix for resource names and the hostname."
  type        = string
  default     = "wa-stg-1"
}

variable "instance_type" {
  description = <<-EOT
    Graviton (arm64) instance type.

    SIZE: the stack sets `mem_limit: 8g` on openwa-api (stack/compose.infra.yml).
    That is a LIMIT, not a reservation — but whatsapp-web.js runs a headless
    Chromium per session, which is the real memory driver (roughly 300-600 MB
    each) on top of Node and Docker.

      t4g.small   2 vCPU /  2 GB   too small: Chromium + Docker will OOM
      t4g.medium  2 vCPU /  4 GB   one or two sessions, tight
      t4g.large   2 vCPU /  8 GB   matches the compose limit; recommended
      t4g.xlarge  4 vCPU / 16 GB   headroom for several sessions

    T4g FREE TRIAL: AWS extended the t4g.small free trial to 2026-12-31 (750
    hours/month, all customers, new and existing). t4g.small is 2 GB and will
    NOT run this stack. There is no free allowance for t4g.large — it bills
    against Free Tier credits. See README.md for the arithmetic.
  EOT
  type        = string
  default     = "t4g.large"

  validation {
    condition     = can(regex("^t4g\\.", var.instance_type))
    error_message = "Use a t4g (Graviton/arm64) type to match the OCI arm64 shape and the stack's images."
  }
}

variable "boot_volume_gbs" {
  description = <<-EOT
    Root EBS volume size in GB (gp3, encrypted). Mirrors the OCI default of 100.
    COST: gp3 is ~$0.08/GB-month, so 100 GB is ~$8/month even while idle.
    There is no free EBS allowance on a credit-based Free plan.
  EOT
  type        = number
  default     = 100
}

variable "vpc_cidr" {
  description = "VPC CIDR. 10.20.0.0/16 keeps it distinct from the Docker bridge (172.31.42.0/24) used by the stack."
  type        = string
  default     = "10.20.0.0/16"
}

variable "subnet_cidr" {
  description = "Public subnet CIDR inside vpc_cidr."
  type        = string
  default     = "10.20.1.0/24"
}

variable "admin_cidr" {
  description = <<-EOT
    Optional CIDR allowed to reach port 22 directly (e.g. your office IP/32).
    Empty = no inbound rules at all, which is the intended posture. Prefer SSM.
  EOT
  type        = string
  default     = ""
}

variable "enable_break_glass_ssh" {
  description = <<-EOT
    Open port 22 to admin_cidr. Default false: SSM Session Manager already gives
    shell access with no open port and no key. Turn this on only if SSM is
    unavailable in your account, and set admin_cidr at the same time.
  EOT
  type        = bool
  default     = false
}

variable "enable_cloudwatch_agent" {
  description = "Attach CloudWatchAgentServerPolicy so the host is observable without shell access."
  type        = bool
  default     = true
}

variable "budget_alert_usd" {
  description = <<-EOT
    Monthly cost budget in USD for an email alert. 0 disables the budget.
    On a credit-based Free plan a runaway resource silently spends the balance
    and the account closes when it is gone — set this.
  EOT
  type        = number
  default     = 75
}

variable "budget_alert_emails" {
  description = "Email addresses for budget alerts. Required when budget_alert_usd > 0."
  type        = list(string)
  default     = []
}
