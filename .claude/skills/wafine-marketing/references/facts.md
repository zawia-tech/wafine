# Verified facts and forbidden claims

Checked against the repo and vault on 2026-10-18. Facts move during launch: before a claim goes public, re-open the source in the last column. Anything not in this file is unverified.

## Table of contents
1. What WaFine is
2. Claims you can make
3. Claims you must not make
4. Credits and names
5. Hostnames and links
6. Numbers that change (never hard-code)

## 1. What WaFine is

Open-core product on OpenWA (`rmyndharis/OpenWA`, open source, MIT). The hosted version runs on our own VM in Casablanca (Oracle Cloud). Users link a WhatsApp number by QR code in the browser, build paced auto-reply workflows, and reach the same session through one REST API and one MCP endpoint. Claude connects as a custom connector over OAuth. Access is invite-only.

## 2. Claims you can make

| Claim | Safe wording | Source |
|---|---|---|
| Invite-only | "Invite-only while we grow carefully." | `app/web/messages/en.json` (`waitlist.intro`) |
| Built in Morocco | "Built in Morocco." | `hero.eyebrow` |
| Link a number from the browser | "Scan a QR code once from WhatsApp Web." | `features.items[3]`, `docs/09-sessions-keys-mcp.md` |
| Paced auto-replies | "Auto-replies go through one sender with a configurable gap, and every send counts against a per-day cap per session." The gap applies to workflow auto-replies only. REST and MCP sends are not gap-paced; they are counted against the daily cap. Do not say that every message is gap-paced. | `docs/08` (PacedReplySender), `docs/09` lines 31-32 and 55, `features.items[0]` (overstated on the site, see the owner list) |
| Reduces ban risk, cannot remove it | "Pacing lowers the risk. No gateway can promise a number never gets banned." | `faq.items[0]` |
| Per-session API keys | "Keys are scoped to one session, shown once, and revocable." Do not say one key per session: a user can hold up to 5 active keys (`docs/09`, wa.ts mint limit). Do not say "in one click" unless the revoke button is confirmed on the keys page. | `docs/09` lines 13-14, `features.items[1]` (its "a key per session" is also overstated) |
| One endpoint for REST and MCP | "The same session answers JSON over REST and tool calls over MCP." | `features.items[2]` |
| Claude connector without sharing a key | "WaFine speaks OAuth, so Claude never sees your API key. Disconnect Claude on the WhatsApp page and its access ends." Revoking a WaFine API key does NOT end Claude access: the connector has its own OAuth grant and engine key. | `docs/10-claude-connector.md` lines 17-19 and 30, `oauth.ts` grant flow |
| Claude can read and send, through your session only | "Claude can read your chats and send messages from your number, through your session only." State it plainly, it is on the consent screen. | `connector.consentNote`, `docs/09` (MCP send on since 2026-10-14) |
| Works with Claude surfaces | Claude Desktop, Cowork, Claude Code, claude.ai as a custom connector. One terminal command: `claude mcp add --transport http whatsapp <connector URL>`. | `connector.snippet` |
| Data location | "The gateway runs on our own VM in Casablanca, the database is in Supabase's Paris region." | `features.items[4]`, `faq.items[2]` |
| Session stays on our server | "Your WhatsApp session stays on our own server." | `hero.subhead` |
| Open-core, self-hostable | "Built on OpenWA. Read the docs, self-host it, or let us run it." | `features.items[5]`, `faq.items[4]` |
| Languages | English, French, Arabic (RTL), Darija wording for Arabic social | `docs` vault `Audience.md` |
| Session drops are visible | "Calls return a clear 'not ready' error instead of failing silently." | `faq.items[5]` |

## 3. Claims you must not make

- "Revoke the key and Claude loses access", "revoking a key ends the connector": false, see the connector row in section 2.
- "Every message is paced", "one sender with a set gap for everything": only auto-replies are gap-paced.
- "WaFine answers for you while you are away": auto-replies are a rule engine with a small set of rules (`docs/08`), not a general assistant. Say what is configured, not what the product "understands".
- "Dedicated number" as a user rule: the public FAQ and the repo rule disagree, so it is not a fact until the owner decides (`CONTRIBUTING.md`, `docs/09` vs the FAQ).

| Do not say | Why |
|---|---|
| "No ban", "ban-proof", "safe", "100% secure", "zero risk" | The FAQ itself says no gateway can promise this. The ban risk sits with the number owner. |
| "End-to-end encrypted" | The honest guarantee is narrower: Supabase, OCI and Cloudflare cannot read message content, but the BFF can, transiently, to run automations (`docs/04-e2e-encryption.md`). Use only the site FAQ wording ("stored encrypted, not as readable text") and re-check that the implementation shipped, `docs/04` was still a design on 2026-10-08. |
| "CNDP compliant", "law 09-08 certified", "GDPR compliant" | Residency is an open owner item: Paris is an international transfer under law 09-08 (risk R10). Describe where data lives, do not certify. |
| "Official", "WhatsApp Business API", "Works with WhatsApp", "Powered by WhatsApp", "partner of Meta" | WaFine runs on unofficial clients (OpenWA), not the Cloud API. No Meta programme covers it (`docs/design-system/README.md`). |
| "Claude partner", "Powered by Claude", "certified by Anthropic", Claude or Anthropic logos | Anthropic's marks need prior approval and implied endorsement is not allowed (risk R15). "Connects to Claude" in plain text is fine. |
| "Free", "cheap", prices, tiers, "pay as you go" | No pricing decision exists. Pricing proposal is planned for December (`Roadmap-KPIs-OKRs.md`). |
| "Public", "available to everyone", "sign up now" | Invite-only. The CTA is "Join the waitlist". |
| "Unlimited", capacity numbers, "scales to thousands" | One A1 VM carries about 12 sessions and the VM may be reclaimed (risk R7). Say "we invite in small batches". |
| "Send to all your customers", broadcast, bulk, cold outreach | Not a use case we support or want attached to the brand. Only message people who contacted you first. |
| "AI writes and sends everything for you" | The pitch is paced and under your control, with rules you keep. |
| Testimonials, user counts, "trusted by", logos of companies | None exist yet. Do not invent them, and do not use a placeholder that looks real. |

## 4. Credits and names

- Product name: **WaFine** (capital W, capital F) in copy, in all three languages. Arabic name `وافين`. Code identifiers, env vars and URLs keep their own spelling. The older `WAFINE` caps appears in vault notes and some repo docs; do not copy it into marketing.
- Site credit line (owner-approved copy in the app): "WaFine, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA." (`footer.credit`). FR: "sponsorisé par Ai4x Academy, construit par ZawIA.Tech". AR: "برعاية Ai4x Academy، وبنية ZawIA.Tech".
- Team credits, used in about pages and press blurbs: developed by Mohamed Moughamir (omnizya and open anaffa), supported by the CDIWG organisation (Bouskoura.online), mentored by Youssef Ghalem (YG Consulting). Ask the owner which names go on a given piece.
- Parent: ZawIA.Tech, the Zawia community by Ai4x Academy. Spell `ZawIA.Tech` for the company and `ZAW'IA` for the community brand.
- The legal footer disclaimer must accompany any public page or long-form piece: WaFine is an independent, unofficial gateway, not affiliated with WhatsApp LLC or Meta Platforms, Inc.; WhatsApp is a trademark of WhatsApp LLC; Claude is a trademark of Anthropic, PBC (`footer.disclaimer`, three languages).

## 5. Hostnames and links

- Site and web app: `wafine.zawia.tech`. API and MCP: `api.wafine.zawia.tech` (MCP at `/mcp`). Docs: a public, indexable `docs.` host.
- On 2026-10-18 no `wafine.*` DNS record existed yet (zawia.tech stays at Namecheap, the API needs Cloudflare for SaaS). Before using any link in copy run `curl -sI https://<host>` and report the result. If it does not resolve, write the copy with the link as a placeholder and say so.
- Sign-up links per language: EN `/auth/signup`, FR `/fr/auth/signup`, AR `/ar/auth/signup` (English has no prefix). The invited number is the only one accepted.
- Keep UTM tags simple and lowercase: `?utm_source=linkedin&utm_medium=social&utm_campaign=launch`.

## 6. Numbers that change (never hard-code in copy)

Launch date (20 October 2026 as planned), invite waves, the daily send cap and per-minute cap (defaults 300 and 10 per session, admin-adjustable), waitlist targets, session capacity. Read the current value from `docs/09-sessions-keys-mcp.md`, `Roadmap-KPIs-OKRs.md` and `Launch-Plan-2026-10-20.md`, or leave the number out. Internal KPIs (150 waitlist sign-ups by 30 November, and so on) are targets, not public claims.
