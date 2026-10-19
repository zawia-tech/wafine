###############################################################################
# OpenWA — AWS staging environment (arm64, no inbound, SSM access)
#
# WHY THIS EXISTS
#   The OCI VM is reachable only over Tailscale SSH, and the tailnet join is
#   still pending admin approval — so the deployed box cannot be inspected.
#   This module provisions an equivalent host that is reachable *without* a
#   tailnet, by using SSM Session Manager instead of SSH.
#
# ARCHITECTURE PARITY WITH terraform/oci (deliberate — do not diverge)
#   * NO inbound rules at all. Nothing listens on the public NIC.
#   * Egress via an internet gateway; the instance has a public IP for egress
#     only. (SSM needs outbound 443 to reach the service endpoints.)
#   * Ingress is Cloudflare Tunnel, configured in terraform/cloudflare — this
#     module does NOT create the tunnel; it only outputs the hostname to point
#     the tunnel's ingress rule at.
#   * arm64 (Graviton), matching the OCI Ampere A1 shape and the stack's images.
#
# ACCESS MODEL DIFFERENCE (intentional)
#   OCI  : Tailscale SSH on the host  -> needs tailnet approval  (BLOCKED)
#   AWS  : SSM Session Manager        -> needs only IAM, no open port, no key
#   SSM is strictly better here: no long-lived SSH key, no inbound port, full
#   CloudTrail audit of every session, and it works before any tailnet exists.
###############################################################################

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region
  # Credentials come from the ambient AWS CLI session (`aws login`), matching
  # how terraform/oci reads ~/.oci/config. No static keys in this repo, ever.
  default_tags {
    tags = {
      Project     = "openwa"
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "terraform/aws"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name = var.name
}

###############################################################################
# Networking — one public subnet, egress only.
###############################################################################

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # required for the SSM interface endpoints / DNS

  tags = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true # egress + SSM only; nothing listens inbound

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

###############################################################################
# Security group — egress only. There is intentionally NO ingress block.
#
# `admin_cidr` mirrors the OCI variable of the same name: it is the ONLY way to
# open an inbound port, it is empty by default, and it is only honoured when
# var.enable_break_glass_ssh is true. With SSM you should never need it.
###############################################################################

resource "aws_security_group" "this" {
  name_prefix = "${local.name}-"
  description = "OpenWA host: egress only. Ingress arrives via Cloudflare Tunnel."
  vpc_id      = aws_vpc.this.id

  # No ingress_security_rules at all unless break-glass is explicitly enabled.
  dynamic "ingress" {
    for_each = var.enable_break_glass_ssh && var.admin_cidr != "" ? [1] : []
    content {
      description = "break-glass SSH from admin_cidr only"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.admin_cidr]
    }
  }

  egress {
    description = "all egress: image pulls, Supabase, Cloudflare Tunnel, SSM"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

###############################################################################
# IAM — SSM Session Manager. This is the access path that replaces Tailscale.
###############################################################################

resource "aws_iam_role" "ssm" {
  name_prefix = "${local.name}-ssm-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name}-ssm-role" }
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# CloudWatch agent is optional but makes the host observable without SSH, which
# is the whole point of this environment. Kept minimal (no custom dashboards).
resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  count      = var.enable_cloudwatch_agent ? 1 : 0
  role       = aws_iam_role.ssm.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "this" {
  name_prefix = "${local.name}-"
  role        = aws_iam_role.ssm.name
  tags        = { Name = "${local.name}-profile" }
}

###############################################################################
# AMI — Canonical Ubuntu 24.04 arm64 (matches the OCI image generation).
###############################################################################

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

###############################################################################
# The host
###############################################################################

resource "aws_instance" "host" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.this.name

  # No key_name: access is SSM only. Adding one would reintroduce the very
  # long-lived credential this design removes.

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.boot_volume_gbs
    encrypted             = true
    delete_on_termination = true
  }

  # IMDSv2 only, and hop limit 1 so a compromised container cannot reach
  # instance credentials. Matches the OCI module's concern that the metadata
  # endpoint must never be reachable from a wider network.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # "standard" credits => burstable instance can NEVER accrue surplus-credit
  # charges. AWS bills surplus CPU credits on T4g; on a credit-based free plan
  # that is the most likely source of a surprise charge. We accept the throttle.
  credit_specification {
    cpu_credits = "standard"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    hostname    = var.name
    environment = var.environment
    enable_cw   = var.enable_cloudwatch_agent
  })

  user_data_replace_on_change = false

  tags = { Name = local.name }

  lifecycle {
    # Ubuntu AMI ids change weekly; do not rebuild the box because of it.
    ignore_changes = [ami]
  }
}

###############################################################################
# Cost guard — a credit-based Free plan silently spends down. Alert early.
###############################################################################

resource "aws_budgets_budget" "monthly" {
  count        = var.budget_alert_usd > 0 ? 1 : 0
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_alert_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }
}
