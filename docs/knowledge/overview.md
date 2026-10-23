# Overview

**WaFine** is an open-core WhatsApp gateway for people who want their own agents and automations on a WhatsApp number. It runs on the open-source **OpenWA** engine (`rmyndharis/OpenWA`, git submodule pinned to v0.24.0, never edited).

## What a user gets
- Link a WhatsApp number by scanning a QR code.
- A REST API with scoped API keys (several per session, revocable).
- Paced auto-replies through a workflow engine.
- An MCP endpoint so Claude and other agents can read and send, using an API key or an OAuth 2.1 connector flow.
- Web app, public docs and a blog, in English, French and Arabic (right-to-left).

## Audience, in order
1. The Zawia Tech community (an Ai4x Academy community).
2. Small and medium businesses.
3. Executives and community managers.
4. Productive individuals who want agentic WhatsApp workflows.

## Launch promise (20/10/2026)
- Release `v0.1.2-alpha`, invite-only, with a waitlist and a phone-number allowlist.
- No pricing yet. Pricing comes after feedback.
- Open-core: the product code is open, built on OpenWA.
- Credits: sponsored by Ai4x Academy, built by ZawIA.Tech, mentored by YG Consulting.

## Not shipped (do not claim)
- End-to-end encryption of message content. Only a design exists (`docs/04-e2e-encryption.md`).
- Agent-to-agent (A2A) features, the in-app assistant and computer-use pairing. These are Vision items.
- Billing and CRM. The admin tabs are placeholders.
- A referral program. Only a waitlist campaign tag exists.

## Repo map
`app/bff` API (Hono) · `app/web` web app (Next.js) · `app/docs` docs (Fumadocs) · `app/api-edge` edge rewrite to the API · `stack/` VM compose files · `terraform/` infrastructure · `supabase/migrations/` SQL · `scripts/` tooling · `docs/` long-form docs · `OpenWA/` upstream submodule.
