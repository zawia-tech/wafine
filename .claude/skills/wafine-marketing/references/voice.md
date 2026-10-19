# Voice, naming and language rules

## Table of contents
1. The voice in five lines
2. Words to avoid
3. Emoji and punctuation
4. English
5. French
6. Arabic (MSA) and Moroccan Darija
7. Reading and rhythm

## 1. The voice in five lines

Taken from the design system (`docs/design-system/README.md`, "Content fundamentals"), which the web app already speaks.

- **Direct, honest, a little dry.** Say what the product does and what it cannot promise. Real line from the site: "Yes — any WhatsApp automation carries that risk, and no gateway can promise otherwise."
- **You and we.** Address the reader as you, WaFine speaks as we. "Your session stays on our own server."
- **Concrete over abstract.** Name the mechanism: "a configurable gap and a per-day cap", "scan a QR code once from WhatsApp Web".
- **Short headings in sentence case**, often a promise with a constraint: "Three steps, no rewrite", "Built for a number that cannot afford to look like a bot".
- **Buttons and CTAs are verbs**: "Join the waitlist", "Read the docs", "Copy".

Why: the audience (developers, SME owners, community managers) distrusts WhatsApp automation hype, and the honest risk wording is the thing that separates WaFine from the spammers.

Eyebrows are 1 to 4 words with a middle dot: "Invite-only · Built in Morocco".

## 2. Words to avoid

| Avoid | Use instead |
|---|---|
| seamless, revolutionary, game changer, supercharge, unlock, empower, next-level, cutting-edge | the actual mechanism |
| révolutionnaire, disruptif, incroyable, secret (Ai4x charter list) | le mécanisme concret |
| "AI-powered" as a headline | say what it does: "answers booking questions while you are away" |
| "bot", "bulk", "blast", "broadcast" in positive framing | "paced reply", "teammate", "workflow" |
| "WhatsApp API" as the product name | "REST API" and "MCP endpoint" on your WhatsApp number |
| "secure" alone | say which part: "keys scoped to one session, shown once" |
| exclamation marks | none in headings, at most one in a social post |

## 3. Emoji and punctuation

- The design system bans emoji in UI and marketing copy. The owner's brief allows a minimum on social posts: **zero in site, docs, email, headings and carousels; at most one or two in a social caption, at the end of a line, never as bullets.**
- Arrows `→` are fine in step instructions ("Settings → Connectors"). Use a middle dot ` · ` as a separator.
- Straight quotes in English copy. Use French guillemets « » and a non-breaking space before `: ; ? !` in French. Arabic uses `،` `؟` `؛` and «guillemets».
- Em dashes appear in the site copy, but do not stack more than one per paragraph, and the vault's own notes avoid them.

## 4. English

International English, plain words, active verbs, sentences under 25 words. Numbers as digits. Spell the connector flow exactly as the UI does ("Settings → Connectors → Add custom connector").

## 5. French

Write as a Moroccan professional writes: `vous` by default, `tu` only for community posts on Zawia channels. Keep technical terms in English where practitioners do (API, MCP, workflow, webhook), translate the rest ("liste d'attente", "réponse automatique rythmée", "sur invitation", "conçu au Maroc"). Reuse the site's FR strings so the copy matches the product: `app/web/messages/fr.json`.

## 6. Arabic (MSA) and Moroccan Darija

Two registers, and the choice is part of the brief.

- **MSA (`ar` site copy, docs, formal email):** clean modern standard Arabic, short sentences, RTL. The site hero already uses a Darija hook ("حوّل رقم واتساب ديالك لمساعد ذكي يخدم معاك") over MSA body, so mixing is accepted on hooks only. Never hard-code left or right in layout notes: use start and end.
- **Darija (social posts, community, WhatsApp-style demos):** Arabic script, not Latin "Arabizi", unless a visual explicitly imitates a chat. Keep brand and technical words in Latin script (WaFine, API, MCP, Claude), written with a normal space around them.
- **Always flag Darija as `[to validate by a native reader]`.** The vault records that Darija wording is unvalidated, and an AI-written dialect line that sounds foreign damages a Moroccan launch. Offer two phrasings when unsure.
- Numbers: Western digits (0-9) for phone numbers, times, versions. Phone numbers are written `+212 6XX XX XX XX`, left to right, isolated from the Arabic around them.
- For layout: mixed Arabic and Latin lines need explicit direction. In HTML wrap Latin runs in `<bdi>` and set `dir="rtl"` on the container.

## 7. Reading and rhythm

- First line carries the hook in all channels (LinkedIn shows about 210 characters before "see more"). Open with a concrete scene or number, not a greeting.
- One idea per post. If two ideas compete, write two posts.
- End with one action: join the waitlist, read the guide, reply with a use case. Never two.
- Prefer a real artefact over a claim: the chat thread, the terminal command, the consent screen, a number from the docs.
