output "instance_id" {
  value = oci_core_instance.host.id
}

output "public_ip" {
  description = "Egress IP only — no ports are open on it. Use it to allowlist the VM elsewhere if needed."
  value       = oci_core_instance.host.public_ip
}

output "tailscale_hostname" {
  description = "Reach the box with: tailscale ssh ubuntu@<this>"
  value       = var.name
}

output "image" {
  value = data.oci_core_images.ubuntu.images[0].display_name
}

