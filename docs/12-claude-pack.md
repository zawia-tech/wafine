---
title: Claude pack
description: WAFINE Claude integration pack - plugin, skills, MCP config
---

# WAFINE Claude Pack

Native Claude integrations for WAFINE: project MCP config, Claude Code plugin, agent skills.

## Contents
- **`.mcp.json`** (repo root): Claude Code project MCP config. Includes `oci`, `openwa` (env-driven), `wafine` (`${WAFINE_MCP_URL:-}`; no tokens).
- **`.claude-plugin/plugin.json`**: Claude Code plugin named `wafine`, references `./skills` (auto-discovered). Includes keywords/homepage.
- **`skills/`**: Agent Skills with frontmatter - `wafine-deploy`, `wafine-onboard`, `wafine-send-message`, `wafine-connect-claude`.
- **`docs/12-claude-pack.md`**: this guide.

## Claude integrations
- **Claude Code**: use `.mcp.json` and the plugin skills. Add MCP: `claude mcp add --transport http whatsapp <WAFINE_MCP_URL>/mcp`.
- **Claude Desktop**: custom connector at `<WAFINE_MCP_URL>/mcp` with OAuth.
- **claude.ai**: custom connector at `<WAFINE_MCP_URL>/mcp` with OAuth.
- **Agents**: load skills for deploy/onboard/send/connect workflows.

Auth: OAuth 2.1 for Claude connectors (no token passthrough); API keys for direct REST. See `docs/09-sessions-keys-mcp.md`, `docs/10-claude-connector.md`.

## Installation
### Claude Code plugin (local)
```bash
/plugin add <path-to-your-checkout>/.claude-plugin
```

### MCP config
Set `WAFINE_MCP_URL` (e.g. `https://api.example.com` or `http://localhost:4000`). `.mcp.json` reads it; no secrets.

## Usage
Load skills as needed: `wafine-deploy` (bootstrap/check), `wafine-onboard` (J1–J7), `wafine-send-message` (REST/MCP sends/reads), `wafine-connect-claude` (connector + OAuth).

## Verification
```bash
jq . .mcp.json
jq . .claude-plugin/plugin.json
make check
```

## Setup
See docs/00-setup.md for environment variables, MCP config, and the single-agent prompt.
