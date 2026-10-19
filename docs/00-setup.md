---
title: Setup
description: Setup guide for humans and agents
---

# Setup Guide

This guide helps both humans and agents set up WAFINE locally or for deployment.

## Prerequisites
- Git
- Bun (runtime + package manager)
- Docker (local dev)
- OpenTofu (terraform wrapper via `scripts/tf`) or Terraform
- gh CLI (optional, for PR operations)
- Claude Code or OpenCode (optional, for agent workflows)

Check prerequisites: `./scripts/bootstrap.sh --check`

## Clone and configure
```bash
git clone https://github.com/zawia-tech/wafine.git
cd openwa-oci-infra

# Copy env examples
cp .env.example .env
cp app/web/.env.example app/web/.env
cp app/bff/.env.example app/bff/.env  # create if missing

# Edit .env files with your real values (never commit secrets)
```

## Environment variables reference

| Name | Component | Example | Where real value lives | Required |
|---|---|---|---|---|
| OPENWA_MCP_URL | MCP (Claude Code) | http://localhost:2785/mcp | stack/.env or VM env | Optional |
| OPENWA_MCP_KEY | MCP (Claude Code) | change-me-openwa-key | pass/path or OpenWA API key | Optional |
| WAFINE_MCP_URL | MCP (Claude Code) | https://api.example.com/mcp | your public API URL | Optional |
| SITE_URL | Web | https://app.example.com | deployment config | Optional |
| PUBLIC_API_URL | BFF/Web | https://api.example.com | deployment config | Yes (prod) |
| WEB_URL | BFF | https://app.example.com | deployment config | Yes |
| NEXT_PUBLIC_API_URL | Web (client config) | https://api.example.com | build/env | Optional |
| NEXT_PUBLIC_DOCS_URL | Web/Docs | https://docs.example.com | build/env | Optional |
| DOCS_URL | Docs | https://docs.example.com | deployment config | Optional |
| CORS_ORIGINS | BFF | https://app.example.com,https://docs.example.com | env | Yes |
| OAUTH_ENC_KEY | BFF (OAuth) | change-me-32-bytes-base64 | pass: `openssl rand -base64 32` | Optional |
| OPENWA_BASE_URL | BFF | http://localhost:2785 | VM/local compose | Yes |
| OPENWA_API_KEY | BFF | change-me-openwa-admin-key | stack/.env or pass | Yes |
| REDIS_URL | BFF | redis://localhost:6379 | compose/env | Yes |
| DATABASE_URL | BFF | postgresql://user:password@...:5432/postgres | Supabase pooler | Yes |
| LOG_LEVEL | BFF | info | env | Optional |

Notes: hosts use `example.com` placeholders; secrets use fake placeholders. Never put real secrets in examples.

## Claude Code integration

Claude Code loads `.mcp.json` from repo root. The file references:
- `oci` (Oracle MCP via uvx)
- `openwa` → `${OPENWA_MCP_URL:-}` with header `Authorization: Bearer ${OPENWA_MCP_KEY:-}`
- `wafine` → `${WAFINE_MCP_URL:-}`

Set these env vars in your shell or `.env` loaded by Claude Code.

## Agent single prompt (from package-plan.md)
Paste into Claude Code or OpenCode from a fresh clone:
> "Read CONTRIBUTING.md and docs/11-bootstrap.md, then run `./bootstrap.sh --agent --target dev` and follow each next-action line until the stack check passes. Report what you deployed and the URLs."

## Local dev
```bash
# Toolchain
./scripts/bootstrap.sh --check
./scripts/bootstrap.sh  # if needed

# Start services
make dev-up  # or follow runbook

# Stack check
OPENWA_DIR=./OpenWA ./scripts/stack-check
```

## Claude pack
See `docs/12-claude-pack.md` for plugin, skills, and MCP usage.

## Credits
WAFINE, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA.
