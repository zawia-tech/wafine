---
name: wafine-marketing
description: Create WaFine content and marketing in EN, FR, Arabic and Moroccan Darija — LinkedIn and X posts, carousels, launch and teaser copy, waitlist and invitation emails, landing and blog copy, demo scripts, tutorials, press blurbs, community posts, visuals and campaign calendars. Applies WaFine's voice, design system, verified product facts and legal guardrails (no ban promises, no WhatsApp or Claude branding misuse, invite-only, no pricing). Make sure to use this skill whenever the user asks to write, plan, translate, review or visualise anything public about WaFine, WAFINE, the waitlist, the Claude connector, the launch, or Zawia/ZawIA.Tech/Ai4x content that mentions the product, even if they only say "post", "copy", "caption", "teaser", "newsletter", "pitch" or "announce".
---

# WaFine content and marketing

WaFine is an open-core WhatsApp gateway for teams, built on OpenWA. One number, paced auto-replies, one REST API and one MCP endpoint that Claude and your own apps can use. It is invite-only, built in Morocco by ZawIA.Tech, sponsored by Ai4x Academy. This skill turns that into content people trust.

The product sits next to a platform that bans automation and next to a model vendor with strict brand rules. Over-claiming costs the owner real things: a banned number, a takedown, a legal question. So the method below is honest first, attractive second, and the two are rarely in conflict: the voice that wins here is direct and a little dry.

## Brand identity (load before any visual or copy)

Sources, in this order; the first one wins when they differ:
1. **Repo:** `docs/design-system/` on main: `README.md` (brand book: voice, colour roles, type, depth, iconography, trademark rules), `tokens.json` (every colour, type, spacing, radius and elevation value, light and dark), `assets/Logos/` (logo files), `components/` (component guidelines). It is a snapshot of `app/web/tailwind.config.ts` and `app/web/src/styles/globals.css`; if those changed after it, they win.
2. **Design System artifact** (private, shared by the owner): <https://claude.ai/artifact/6Un5wBX4jkk2LF9247WMYD>, re-synced from the repo folder on 18/10/2026 (version 4). Use it to show the system to people; never copy values from it that disagree with the repo.
3. **This skill's `references/visuals.md`:** the tokens and logo rules you need most often, condensed from the two above.

Identity at a glance: name **WaFine** (Arabic **وافين**, Darija for "where are you"); mark = a rounded speech bubble carrying وافين; palette pine `#1c5c42` / cream `#fcfaf6` / clay accents, never WhatsApp green; Fredoka 600 headings, Inter body, Noto Sans Arabic for Arabic; layered depth (rest, raised, floating). Credits line: "WaFine, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA."

Logo rules that are easy to get wrong:
- The Arabic lettering is the HarfBuzz-shaped Noto Kufi Arabic Black outline, used verbatim from `docs/design-system/assets/Logos/wafine-mark.svg`. Never redraw, retype, mirror or re-letter وافين in a tool; Arabic letters join by position and hand-made versions come out broken.
- Below about 48 px the word is illegible: the tab icon and favicon are the plain bubble. The 512 px app icon also stays a plain bubble until the owner finishes his Inkscape polish of the mark; do not ship a lettered app icon before that.
- Every public page and every long-form piece carries the non-affiliation line (`footer.disclaimer` in `app/web/messages/*.json`): WaFine is independent and unofficial, not affiliated with, authorized or endorsed by WhatsApp LLC or Meta Platforms, Inc.

## Workflow

1. **Frame the brief in four lines** before writing: content type, audience, language, one action you want from the reader. Audience priority is the Zawia Tech community, then SMEs, C-suite, community managers, productive individuals (`references/campaigns.md`). If the user did not say, pick the closest and say which.
2. **Collect claims from `references/facts.md` only.** It lists what is verified, where it came from and what must never be said. A claim that is not there: check the source file it points to (`app/web/messages/*.json` is the owner-approved site copy), otherwise drop it or mark it `[to verify]`. Facts move fast during launch, so never trust memory for dates, hostnames, caps or capacity.
3. **Write natively in each language**, not by translating. Voice, banned words and per-language rules are in `references/voice.md`. Arabic and Darija are launch languages; Darija wording is never final until a native reader validated it (the vault says so), so flag it.
4. **Pick the shape** in `references/formats.md` (LinkedIn post, carousel, X thread, email, landing section, blog outline, demo script, press blurb, community post). Use its templates as skeletons, not scripts.
5. **Run the check.** Save each piece of final copy to its own file (one per language and channel) and run `python3 .claude/skills/wafine-marketing/scripts/lint_copy.py <file> [--channel linkedin|x|email-subject|meta]`. It catches banned words, forbidden claims, wrong product casing, emoji overuse and length. Fix every ERROR; read each WARN and decide. Lint the copy files, not the delivery package: the package quotes the claims you rejected ("free", "never banned"), so it would flag itself.
6. **Deliver a package**, not a wall of text: the final copy per language, a one-line rationale for the hook, a "claims check" table (claim, source), visuals brief or file, and open points for the owner. Keep it short; the owner is a developer and the mentor is a trainer, neither wants fluff.

Visuals: `references/visuals.md`, and `scripts/render_card.mjs` renders on-brand PNG cards (OG 1200x630, LinkedIn 1080x1350, square 1080x1080, EN/FR/AR with RTL).

## Hard rules (the why is in `references/voice.md` and `references/facts.md`)

- **Never publish, send or schedule anything.** Drafts only. Brevo campaigns, social posts, ads and DNS-dependent links need the owner's explicit yes, and the invitation mail is sent by hand from Brevo.
- **Never use WaFine to message strangers.** No cold bulk sends in the product's own marketing either: invitations go to people who joined the waitlist, by email. The product's pitch is a number that cannot afford to look like a bot; our marketing must not behave like one.
- **No promise about bans, compliance or official status.** Say "reduces the risk", never "safe from bans". No "CNDP compliant". Not affiliated with WhatsApp or Meta, not endorsed by Anthropic.
- **No pricing, no "free", no tiers.** Pricing is not decided; the CTA is "Join the waitlist".
- **Third-party marks are plain text.** No WhatsApp logo or green `#25d366`, no Claude or Anthropic logos, no "Works with WhatsApp", "Powered by WhatsApp", "WhatsApp Business API", "official".
- **Secrets and personal data stay out.** No API keys, tokens, real phone numbers, lead emails or the owner/admin number in any copy, mock-up or example. Use `+212 6XX XX XX XX` and `example.com`.
- **Check a link before it goes in copy.** `curl -sI` the host: the public hosts were not all live on 2026-10-18. The docs host is public: link it once it answers 200.
- **Durable decisions go to the vault, not to this skill.** If the owner picks a tagline, a launch date or a channel plan, propose a `wafine-brain` COMMIT (decision note + journal) following that vault's own rules. This skill holds method; the vault holds facts.

## When requirements conflict

The owner's decisions win over older plans (`owner-defaults v2` beats the early rebrand plan): hero "Turn your WhatsApp number into an AI teammate.", no Pricing link, primary CTA "Join the waitlist". Where this skill and the repo's `docs/design-system/README.md` differ on look or voice, the design system wins. Brand identity is the WaFine design system: `assets/design-system/` in this skill, a copy of `docs/design-system/`. `scripts/check_brand.py` fails when the copy drifts. Two known stale sources: the vault's `Resources/Brand.md` (old blue palette, `WAFINE` caps, `W` monogram) and `docs/design-system` v0 from PR #71. Use the current v2 values in `assets/design-system/tokens.json`.

## Reference map

| File | Read it when |
|---|---|
| `references/facts.md` | before every claim: verified facts, sources, forbidden claims |
| `references/voice.md` | before writing: tone, naming, banned words, EN/FR/AR/Darija rules |
| `references/formats.md` | choosing and structuring a deliverable, with templates |
| `references/campaigns.md` | audiences, launch phases, content pillars, calendar, KPIs |
| `references/visuals.md` | any image, card, carousel, video storyboard or mock-up |
| `assets/design-system/brand-book.md` | the brand book itself: voice, colour, type, iconography (copy of `docs/design-system/README.md`) |
