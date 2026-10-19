# Formats and templates

Skeletons, not scripts. Fill them with verified facts (`facts.md`) and the voice (`voice.md`). Each deliverable ends with the claims check table.

## Table of contents
1. LinkedIn post
2. Carousel (LinkedIn, 1080x1350)
3. X thread
4. Email: waitlist confirmation, invitation, launch note
5. Landing, docs and blog copy
6. Demo script (60 to 90 seconds)
7. Tutorial teaser
8. Community post (Zawia channels)
9. Press blurb and bio
10. The delivery package

## 1. LinkedIn post

Length 600 to 1,300 characters. Hook inside the first 210.

```
[Hook: a scene or a number, one line]

[The problem in two lines, from the reader's world]

[What WaFine does, the mechanism, three short lines or one tight paragraph]

[One honest limit. Example: no gateway can promise a number never gets banned, so we pace every send.]

[Single CTA: Join the waitlist (invite-only) · link]

#WhatsApp #AI #Morocco   (max 3, last line)
```

Hook patterns that fit the brand: the booking conversation from the hero thread; "Your WhatsApp answers while you're in a meeting"; "One command to give Claude your WhatsApp: `claude mcp add ...`"; "Why we pace every message".

## 2. Carousel (LinkedIn, 1080x1350, 6 to 8 slides)

1. Hook, 8 words max, eyebrow above ("Invite-only · Built in Morocco").
2. The problem, one sentence.
3. The mechanism (what happens, with the real chat thread or the terminal command).
4. Proof: one verified fact per slide, never two.
5. The honest limit (ban risk, invite-only).
6. How to start: the three real steps (join waitlist, get invited, scan the QR).
7. CTA: "Join the waitlist" + host.
8. Credits strip and legal line.

One idea per slide, 25 words max, Arabic cards mirrored (RTL). Render with `scripts/render_card.mjs` or the design-system tokens; write alt text for every slide.

## 3. X thread

6 to 8 posts, 280 characters each. Post 1 is the hook and stands alone. Posts 2 to 6 one fact each. Last post the CTA and the credit. No more than one hashtag, none in the first post. Thread numbering as `1/`.

## 4. Email

Sender and flow (verified in the vault's `Invitation-Pack.md`): the app sends no invitation email. An admin allowlists the number in `/admin`, then the invitation is sent by hand from Brevo as `WaFine <no-reply@zawia.tech>`. Supabase then sends its own "Confirm signup" mail. One language per Brevo invitation; Supabase templates are trilingual. Reuse that pack's copy instead of rewriting it, and note it is pending owner validation, Darija included.

- **Subject lines:** under 60 characters, concrete, no emoji, no "!!!". Example: "Your WaFine access is open".
- **Waitlist confirmation** (what the site already promises): one message when the invite is ready, no newsletters, no sharing.
- **Launch note to the waitlist:** 120 to 180 words. What is live, who is invited first, what we ask in return (feedback, a dedicated warmed-up number), one link.
- **Never** send or schedule: create a draft or paste-ready text. Creating a Brevo campaign is an external action: ask first. Leads' real addresses never enter a file you save.

## 5. Landing, docs and blog copy

- Reuse the app's string files as the source (`app/web/messages/{en,fr,ar}.json`), keep the key structure, and give the same sentence in three languages, not three different pitches.
- Blog outline: title (promise plus constraint), 100-word intro with the mechanism, 3 to 5 sections each with an artefact (command, screenshot, diagram), an "honest limits" section, CTA. Meta description under 155 characters, title under 60, `%s · WaFine` template.
- SEO: write for the question people type ("connect Claude to WhatsApp", "WhatsApp auto reply API Morocco", "MCP WhatsApp"), not for keywords. Add FAQ-style headings. Hreflang for en, fr, ar.
- Every public long-form page carries the credit line and the legal disclaimer (`facts.md` section 4).

## 6. Demo script (60 to 90 seconds)

| Time | On screen | Voice |
|---|---|---|
| 0-5 | The chat thread from the hero (client asks for a slot) | The hook line |
| 5-20 | Scan the QR in the browser, session turns ready | "One number, linked in a browser." |
| 20-40 | A paced auto-reply fires, show the gap and the cap | "Every message goes through one paced sender." |
| 40-60 | Claude Desktop: add connector, consent screen, Allow | "Claude never sees your key. Revoke it and access ends." |
| 60-80 | Ask Claude a question about the chat, it answers | One honest sentence about limits |
| 80-90 | Waitlist page | CTA and credits |

Use a dedicated test number and sample data. No real contacts, no real phone numbers, no keys on screen. Silent captions in EN, FR and AR.

## 7. Tutorial teaser

Three beats: the outcome ("your Claude can read and answer a WhatsApp thread"), the three commands or clicks, the limit. Link to the full guide. The existing booklet "المكتب الرقمي الذكي" (Obsidian + Hermes + TabTree + WaFine demo) is the model: practical, step by step, honest about preview-stage tools.

## 8. Community post (Zawia channels)

Short, first person plural, informal `tu` in French and Darija in Arabic. Ask for one thing: feedback from people already invited, or a use case from people on the waitlist. Credit the community, name the next step and date only if confirmed in the launch plan.

## 9. Press blurb and bio

- 50 words: "WaFine is an open-core gateway that turns a WhatsApp number into a paced, API-ready teammate for teams. Built in Morocco by ZawIA.Tech, sponsored by Ai4x Academy, on the open-source OpenWA engine. Invite-only." 
- 120 words: add the three mechanisms (pacing, per-session keys, REST and MCP), the Claude connector in one sentence, the honest limit, hosting in Casablanca and Paris, contact.
- Bio of the developer and mentor: ask the owner which of the credits in `facts.md` section 4 to use. Do not invent titles.

## 10. The delivery package

```
## Copy
[EN] ...   [FR] ...   [AR/Darija] ... (flag: to validate)

## Why this hook
One line.

## Claims check
| Claim | Source |
|---|---|

## Visuals
File paths or brief (size, text, alt text).

## Needs the owner
Links to verify, names to credit, Darija validation, anything to send or publish.
```
