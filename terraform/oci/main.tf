terraform {
  required_version = ">= 1.6"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 9.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.12"
    }
  }
}

# Credentials come from ~/.oci/config (written by `oci setup bootstrap`), so no keys live in tfvars.
provider "oci" {
  config_file_profile = var.oci_profile
  region              = var.region
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Dedicated compartment unless an existing one is passed in. Identity changes must happen in the
# home region (af-casablanca-1 here), and a fresh compartment takes a moment to be usable.
resource "oci_identity_compartment" "wa" {
  count          = var.compartment_ocid == "" ? 1 : 0
  compartment_id = var.tenancy_ocid
  name           = "wa-infra"
  description    = "OpenWA WhatsApp gateway (managed by terraform/oci)"
  enable_delete  = true
}

resource "time_sleep" "compartment_propagation" {
  count           = var.compartment_ocid == "" ? 1 : 0
  depends_on      = [oci_identity_compartment.wa]
  create_duration = "90s"
}

locals {
  compartment_id = var.compartment_ocid != "" ? var.compartment_ocid : oci_identity_compartment.wa[0].id
}

# Latest Canonical Ubuntu 24.04 image compatible with the chosen shape (aarch64 for A1).
data "oci_core_images" "ubuntu" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# ---------------------------------------------------------------------------
# Network: one public subnet, ZERO inbound rules by default.
# cloudflared and tailscaled only dial out, so nothing needs to listen publicly.
# ---------------------------------------------------------------------------
resource "oci_core_vcn" "this" {
  depends_on     = [time_sleep.compartment_propagation]
  compartment_id = local.compartment_id
  display_name   = "${var.name}-vcn"
  cidr_blocks    = [var.vcn_cidr]
  dns_label      = "wavcn"
}

resource "oci_core_internet_gateway" "this" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-igw"
}

resource "oci_core_route_table" "public" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-rt"
  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.this.id
  }
}

resource "oci_core_security_list" "egress_only" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-egress-only"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # Path-MTU discovery (ICMP 3/4). Without it, large TLS records stall when the
  # 9000-byte OCI MTU meets the 1500-byte internet.
  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "1"
    icmp_options {
      type = 3
      code = 4
    }
  }

  dynamic "ingress_security_rules" {
    for_each = var.tailscale_direct_udp ? [1] : []
    content {
      source   = "0.0.0.0/0"
      protocol = "17"
      udp_options {
        min = 41641
        max = 41641
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = var.admin_cidr == "" ? [] : [var.admin_cidr]
    content {
      source   = ingress_security_rules.value
      protocol = "6"
      tcp_options {
        min = 22
        max = 22
      }
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id    = local.compartment_id
  vcn_id            = oci_core_vcn.this.id
  display_name      = "${var.name}-public"
  cidr_block        = cidrsubnet(var.vcn_cidr, 8, 1)
  dns_label         = "pub"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.egress_only.id]
}

# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------
resource "oci_core_instance" "host" {
  compartment_id      = local.compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = var.name
  shape               = var.shape

  dynamic "shape_config" {
    for_each = can(regex("Flex$", var.shape)) ? [1] : []
    content {
      ocpus         = var.ocpus
      memory_in_gbs = var.memory_gbs
    }
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true # egress via the internet gateway; nothing listens on it
    hostname_label   = replace(var.name, "-", "")
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      hostname           = var.name
      tailscale_auth_key = var.tailscale_auth_key
      direct_udp         = var.tailscale_direct_udp
    }))
  }

  # Ubuntu image ids change weekly; don't rebuild the box because of it.
  lifecycle {
    ignore_changes = [source_details[0].source_id, metadata["user_data"]]
  }
}
