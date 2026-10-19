# Visuals

Brand identity sources and their order: see "Brand identity" in `../SKILL.md` (repo `docs/design-system/` first, then the Design System artifact <https://claude.ai/artifact/6Un5wBX4jkk2LF9247WMYD>).

Source of truth: `docs/design-system/` in the repo (brand book `README.md`, `tokens.json`, `assets/Logos`). The skill ships a copy in `assets/design-system/` so it works when packaged away from the repo. Use the copy in your work; it must match the repo. Check with `python3 scripts/check_brand.py` (exit 1 on drift), and re-copy with `python3 scripts/check_brand.py --sync` after a brand change. `render_card.mjs` reads its colours from `assets/design-system/tokens.json`, so changing a token in the repo and syncing is enough.

This is v2: pine, clay and paper, rounded display face. It replaces the v0 blue look.

## Table of contents
1. Tokens you need
2. Logo
3. Sizes
4. Rules
5. Rendering cards
6. Charts and diagrams
7. Video and motion
8. Accessibility

## 1. Tokens you need

| Role | Light | Dark | Use |
|---|---|---|---|
| primary (pine) | `#1c5c42` | `#6ecfa6` | the one primary action, the mark, links |
| primary-content | `#fcfaf6` | `#06120d` | text on primary |
| secondary (clay) | `#a5562f` | `#e08a5f` | eyebrows, highlight chips, one per view |
| accent (ochre) | `#8c6b3f` | `#d8a24a` | a reserved third emphasis |
| neutral (pine ink) | `#2c3a33` | `#1e2a24` | dark bands, inverted mark |
| neutral-content | `#f4efe6` | `#d9e3dc` | text on dark bands |
| base-100 paper | `#fcfaf6` | `#0f1512` | page ground |
| base-200 | `#f4efe6` | `#17201c` | alternate bands, inbound bubbles |
| base-300 | `#e3dbcc` | `#263129` | borders |
| base-content | `#1a211d` | | body text |
| muted text | `#5b6560` | | captions |

Status colours (success `#15803d`, warning `#b45309`, error `#b91c1c`, info `#0284c7`) always come with a word, never colour alone.

Type: **Fredoka 600** for every heading (tracking -0.02em), **Inter** for body, **Noto Sans Arabic** behind both for Arabic glyphs. Load them from Google Fonts. Radii: pills (`9999px`) for buttons and badges, `1.25rem` for cards. Depth is three steps tinted pine, never grey: rest (border only), raised, floating. Spacing on a 4 px grid.

Never use WhatsApp green `#25d366` or any green close to it as a brand colour. Pine is deliberately different.

## 2. Logo

The bubble mark carrying the Arabic wordmark `وافين`, plus the wordmark `WaFine` in Fredoka 600, 8 px gap. Files: `assets/design-system/assets/Logos/` (`wafine-mark.svg`, `wafine-app-icon.svg`, `.png` icons).

- Light ground: bubble `#1c5c42`, word `#fcfaf6`. Dark band: swap to bubble `#f4efe6`, word `#2c3a33`.
- Below about 48 px use the lettering-free app icon. Never redraw, recolour outside these pairs, trace or mirror the Arabic lettering.
- The mark is original. Never combine it with the WhatsApp logo, the Meta logo or a Claude logo. Mention those names in text only.
- Parent and credits: ZAW'IA mark and Ai4x wordmark are official files from zawia.tech and ai4x.academy (`assets/img/logos/`). Use them only in a credits strip, not as the main mark.

## 3. Sizes

| Surface | Size | Notes |
|---|---|---|
| Open Graph / link preview | 1200x630 PNG | absolute URL in the page; readable at thumbnail size |
| LinkedIn portrait or carousel | 1080x1350 | one idea per slide |
| Square | 1080x1080 | X, Instagram |
| Story or vertical video | 1080x1920 | keep captions inside the central safe area |
| Email header | 1200x400 | reduce text, alt text mandatory |

## 4. Rules

- **No photography, no stock illustration.** The hero visual is the real chat thread (bubbles, ticks, timestamps) rendered in HTML. Diagrams are real mechanisms, not boxes of buzzwords.
- **No fake testimonials, no fake user counts, no real conversations.** Chat mock-ups use invented first names and `+212 6XX XX XX XX`.
- One primary action per visual. Pine for it, clay for the eyebrow, nothing else competes.
- Headlines in sentence case, eyebrow in sentence case (CSS uppercases it).
- Every public visual carries the wordmark. Long-form pieces add the credit line and the legal disclaimer.
- Arabic cards: `dir="rtl"`, mirrored layout, Latin brand names kept LTR with `<bdi>`, Western digits for numbers.
- Dark variants use the dark tokens and dark text on every coloured fill.

## 5. Rendering cards

`scripts/render_card.mjs` renders a PNG with Playwright and headless Chromium (preinstalled in the Claude Code cloud environment at `PLAYWRIGHT_BROWSERS_PATH`; do not run `playwright install`). Fonts come from Google Fonts, so the machine needs network access to `fonts.googleapis.com`; without it the card falls back to system fonts and you should say so.

```
node .claude/skills/wafine-marketing/scripts/render_card.mjs \
  --lang en --size linkedin --theme pine \
  --eyebrow "Invite-only · Built in Morocco" \
  --headline "Turn your WhatsApp number into an AI teammate." \
  --sub "Paced auto-replies, one REST API, one MCP endpoint." \
  --cta "Join the waitlist" --url "wafine.zawia.tech" \
  --out /tmp/wafine-card-en.png
```

Options: `--size og|linkedin|square`, `--theme light|pine|dark`, `--lang en|fr|ar`, `--thread '[{"side":"in","text":"..."},{"side":"out","text":"..."}]'` to draw the chat, `--legal` to add the disclaimer strip, `--html` to also write the HTML. If `playwright` is not importable, set `PLAYWRIGHT_NODE_PATH` to a folder that contains it. Open the PNG and check it yourself: line breaks, RTL, overflow.

## 6. Charts and diagrams

Load the `dataviz` skill for any chart. Use the pine ramp for magnitude, clay for the highlight, validate palettes with its script, never a dual axis. For architecture diagrams, Excalidraw (hand-drawn style) works well for tutorials and Mermaid for sequences; keep text short and brand colours. The guide "المكتب الرقمي الذكي" shows the look.

## 7. Video and motion

Motion is minimal in the brand: 0.2 s on buttons, one decorative chevron. For videos: calm cuts, real screen recordings of the real flows, captions in EN, FR and AR, no music that drowns the demo. Storyboard first (see the demo script in `formats.md`). Do not generate people or voices that imitate a real person.

## 8. Accessibility

Contrast at least 4.5:1 for text (the design system checks its own pairs; `info` plus white is about 4.1 and needs bold or large text). Alt text on every image, written as a sentence. Do not rely on colour alone. Do not put essential text in the lower 12 percent of a vertical video where platform UI covers it. Avoid flashing.
