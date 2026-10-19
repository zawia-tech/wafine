output "instance_id" {
  description = "EC2 instance id. Use with: aws ssm start-session --target <id>"
  value       = aws_instance.host.id
}

output "instance_arn" {
  description = "EC2 instance ARN, for scoping IAM policies that grant ssm:StartSession."
  value       = aws_instance.host.arn
}

output "public_ip" {
  description = "Public IPv4 — for EGRESS ONLY (image pulls, Supabase, Cloudflare Tunnel). No inbound rules exist, so this is not reachable from the internet. Note AWS bills ~$0.005/hr for a public IPv4 outside legacy free tier."
  value       = aws_instance.host.public_ip
}

output "private_ip" {
  description = "Private IP inside the VPC."
  value       = aws_instance.host.private_ip
}

output "region" {
  description = "Region the host was created in."
  value       = data.aws_region.current.name
}

output "account_id" {
  description = "AWS account the host was created in — confirm this is the intended account before applying."
  value       = data.aws_caller_identity.current.account_id
}

output "ssm_session_command" {
  description = "Ready-to-paste shell access. This is the Tailscale replacement."
  value       = "aws ssm start-session --target ${aws_instance.host.id} --region ${data.aws_region.current.name}"
}

output "cloudflare_tunnel_target" {
  description = "Point the Cloudflare Tunnel ingress rule at this. The tunnel runs as a container ON this host and reaches openwa-api over the stack's docker network, so the service address is unchanged from OCI (http://openwa-api:2785). Only the host running cloudflared differs."
  value       = "http://openwa-api:2785"
}

output "cost_warning" {
  description = "Read this before leaving the stack running."
  value       = <<-EOT
    This host is NOT covered by an always-free allowance:
      * t4g.large        -> bills against Free Tier credits
      * 100 GB gp3 EBS   -> ~$8/month, billed even when the instance is stopped
      * public IPv4      -> ~$3.60/month
    The T4g free trial covers t4g.small only (2 GB), which cannot run this stack
    (openwa-api has an 8g mem_limit and runs headless Chromium per session).
    Free-plan accounts CLOSE when credits are exhausted. Run `terraform destroy`
    when the staging environment is no longer needed.
  EOT
}
