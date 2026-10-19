# WaFine design system · v5 · 18/10/2026

WaFine is a WhatsApp gateway for teams: one number, paced auto-replies, one REST API and one MCP endpoint. The interface is warm and Moroccan — paper and pine, clay accents, a rounded display face — because WaFine is built to feel like a friendly teammate you control, not a surveillance console. The live web system is in `app/web` (Tailwind CSS 4 + daisyUI 5, themes `wafine-light` and `wafine-dark`).

This revision supersedes the earlier v0 snapshot (blue, `W` monogram, `WAFINE` casing, borders-only depth) that lived in PR #71.

## Live components

These typed wrappers in `app/web/src/components/ui/` are the live component source. The HTML cards under `components/` are reference previews only.

| Component | Live implementation | Main variants |
|---|---|---|
| Button | `button.tsx` | primary, secondary, ghost, outline; sm, md, lg |
| Badge | `badge.tsx` | primary, secondary, neutral, outline; sm, md, lg |
| Card | `card.tsx` | default, bordered |
| Field | `field.tsx` | label, control, hint, error |
| Alert | `alert.tsx` | info, success, warning, error |
| SectionHeading | `section-heading.tsx` | centered/left; paper or pine |

Marketing sections and CopyField use these components where their markup matches. Admin and app screens keep their existing local composition.

## Content fundamentals

- **Voice: direct, honest, a little dry.** Say what the product does and what it cannot promise. Real copy: *"Yes — any WhatsApp automation carries that risk, and no gateway can promise otherwise."*
- **Address the reader as *you*; WaFine speaks as *we*.** *"Your session stays on our own server."*
- **Concrete over abstract.** Name the mechanism: *"a configurable gap and a per-day cap"*, *"Scan a QR code once from WhatsApp Web."* No "seamless", "revolutionary", "supercharge".
- **Short headings in sentence case**, often a promise with a constraint: *"Three steps, no rewrite"*, *"Built for a number that cannot afford to look like a bot"*.
- **Eyebrows** are 1–4 words, rendered uppercase by CSS — write them in sentence case in source (*"Invite-only · Built in Morocco"*). Use the middle dot ` · ` as the separator.
- **Product name is `WaFine`** (capital W, capital F) in copy, metadata, manifest and OG cards, in all three locales. The Arabic name stays `وافين`. Code identifiers, env vars and the npm scope keep their existing spelling.
- **Three locales, one design:** English (default), French, Arabic (`dir="rtl"`). Never hard-code left/right — use logical properties (`start`/`end`); layouts must mirror.
- **No emoji** in UI or marketing copy. Arrows `→` are allowed in step instructions (*"Settings → Connectors"*).
- Button labels are verbs: *"Join the waitlist"*, *"Read the docs"*, *"Copy"* → *"Copied"*, *"Log out"*.

## Visual foundations

### Colour
- Page ground is `base-100` (warm paper `#fcfaf6`); alternate marketing bands use `base-200`, separated by a `base-300` top border. The **pine bands** (connector panel, waitlist, footer) are the `neutral` role: `bg-neutral text-neutral-content`.
- Body text is `base-content`. Secondary text (sub-heads, card bodies, hints, captions) is `base-content-muted` — the source writes it as `text-base-content/75`. Eyebrows are `secondary` (clay).
- `primary` is brand pine (`#1c5c42`), deliberately not WhatsApp green. Use it for the one primary action per view (`btn-primary`), the bubble mark, links and the focus ring. Hover goes to `primary-hover`.
- `secondary` (clay/terracotta) is the warm counterweight: the mark's tail, the section eyebrows, highlight chips. `accent` (ochre) is a reserved third emphasis; `neutral` (deep pine-ink) is the dark band and the inverted mark.
- Status: `success`, `warning`, `error`, `info`, each with its `-content` pair. Always pair status colour with a word. `info` + white text is ~4.1:1 on light — keep info labels bold/large or use a tinted alert.
- **White-label:** tenants override `primary`, `primary-hover` and the surface/text tokens at runtime (`applyTheme()` → `--wl-primary-color`, `--color-surface`, …). Build with roles, never literal hex, so tenant themes keep working.
- **Dark theme** (`wafine-dark`) is a deep pine-ink ground (`#0f1512`) with lightened brand hues and **dark text on every coloured fill** (`*-content` = deep ink). Switching is one `data-theme` flip on `<html>`; the light/dark pair also answers `prefers-color-scheme` before hydration. The root layout carries `<meta name="darkreader-lock" />` so the Dark Reader extension cannot invert the themed surfaces.

### Type
- Two families plus Arabic fallback: **Fredoka** (rounded display face) for every heading, h-group and `.card-title`; **Inter** for body and interface copy; **Noto Sans Arabic** behind both per glyph (neither Fredoka nor Inter has an Arabic subset), then `system-ui`. Code uses the system mono stack.
- Hierarchy: `eyebrow` (sans) → `display` (h1) or `heading` (h2) → `subhead`/`body`. Display and heading are Fredoka 600 with `-0.02em` tracking; the body face stays Inter so long copy stays readable.
- `body-sm` (14px) is the interface workhorse; `caption` (12px) for hints and labels; `code` for keys and URLs.
- Headings scale down on mobile: display 48 → 36 → 30px, heading 30 → 24px.

### Spacing & layout
- Marketing content sits in `container` (1152px) with a 16px gutter (`space-4`); sections pad `space-14` (mobile) / `space-20`.
- Section heading → content: `space-10`. Card grids: 1 / 2 / 3 columns with `space-5` gaps. Card bodies pad `space-8` with `space-3` between items.
- Centred headings and the FAQ cap at `prose-width`; the auth card at `auth-width`.
- Landing sections may use layered depth (a parallax hero layer over the page ground); app screens (auth, admin, settings) stay flat.

### Shape, radius, depth
- Radii are playful: `rounded-btn` (`9999px`, pills) for buttons and badges, `rounded-box` (`1.25rem`) for cards and panels. Multi-line fields override to `0.875rem` — a pill textarea reads as a lens. The icon tile radius is `rounded-mark` (21.875%, `rx 112` on 512).
- **Three-step elevation scale** (owner decision 2026-10-18), tinted pine, never neutral grey:
  - `elevation-rest` — border only, no shadow. The default, and where app screens live.
  - `elevation-raised` — soft pine-tinted shadow (`shadow-raised`): feature cards on hover, the marked step badges.
  - `elevation-floating` — deeper pine-tinted shadow (`shadow-floating`): the hero chat-thread layer and other overlay panels.
- The app header is sticky, `base-100` at 95% with `backdrop-blur`, bottom-bordered.

### Interaction & accessibility
- Every interactive control is at least `tap-target` (44px) tall.
- Focus: `2px solid` `focus-ring`, `2px` offset, on every focusable element.
- Motion tokens are `fast` 120ms, `base` 200ms, and `slow` 320ms, with `standard` and `emphasized` easing curves. DaisyUI button and input transitions use the motion family. Every motion is disabled under `prefers-reduced-motion: reduce`; the FAQ chevron rotation is the only decorative motion.
- Inputs always have a visible label; placeholders carry hints only.
- A skip link ("Skip to content") is the first focusable element on every page.
- Secrets shown once (fresh API keys) get the `warning` border on a `warning`/10 tint.

## Iconography
- **Inline SVG strokes, 24×24 grid, `stroke-width 2`, round caps**, drawn in `currentColor` at 16–20px. The set in use: menu, close, sun, moon, chevron-down (see the **Icons** asset group). No icon library is installed; add new icons in the same Lucide-like stroke style.
- Icons never carry meaning alone in buttons without an `aria-label`.
- **Logo:** the bubble mark — a rounded speech bubble carrying the Arabic wordmark `وافين` — paired with the Latin wordmark `WaFine` set in **Fredoka 600 everywhere**, tracking-tight, 8px gap. The live `Brand` lockup is used by the site header; the Brand reference preview uses the same display face. The mark is one SVG with two paths (bubble + word); it recolours through `primary`/`primary-content` (and inverts to `neutral`/`neutral-content` on the dark bands), so light, dark and tenant themes all keep contrast without a second asset.
- **Tiny sizes:** below ~48px the word is illegible, so the tab icon (`/icon.svg`) and `favicon.ico` (16/32/48/64px) use the bubble alone — a mono, letter-free mark — on the pine tile. The lettered lockup starts at `apple-icon.png` (180px) and `icon.png` (512px).
- **Arabic lettering:** the `وافين` outline is the HarfBuzz-shaped path from Noto Kufi Arabic Black (SIL Open Font License), used verbatim — never hand-drawn or mirrored. Placement inside the bubble is a translate+scale transform only.
- **Trademark:** the mark is original. Do not copy, trace, recolor or combine the WhatsApp logo or Meta assets; mention WhatsApp only in plain descriptive text ("Connect your WhatsApp number"). Never write "Works with WhatsApp", "Powered by WhatsApp" or "WhatsApp Business API": no such Meta program covers WaFine, and WaFine runs on unofficial clients (OpenWA), not the Cloud API. Every public page carries the footer disclaimer (`footer.disclaimer`). Never use WhatsApp green `#25d366`.
- No photography or illustrations; the hero visual is the real chat thread (bubbles, ticks, timestamps) rendered in HTML, not a diagram of boxes.

## White-label aliases

The compatibility variables `--color-surface`, `--color-surface-alt`, `--color-border`, and `--color-text` stay available to white-label utilities. They reference daisyUI's active `--color-base-100`, `--color-base-200`, `--color-base-300`, and `--color-base-content` roles, so tenant overrides flow through one source of truth. `applyTheme()` updates those base roles; it does not write over the aliases.

## Docs theme

`app/docs/app/wafine-theme.css` applies the same warm paper/pine palette in Fumadocs light and dark modes, Fredoka 600 for display headings, Inter for Latin interface/body copy, Noto Sans Arabic fallback, and the shared 1.25rem card radius. The docs stylesheet imports it after Fumadocs' neutral preset.

## Open Graph cards

`app/web/src/lib/og.tsx` renders social cards at **1200 × 630 px**. The layout uses 64px outer padding, a 12px pine-to-clay rail at the left edge, the mark in a 56px pine tile, a 44px wordmark, and a flexible centered title/subtitle area above a bottom badge and optional host label. Colors use warm paper, pine, clay, and ink (`#fcfaf6`, `#1c5c42`, `#a5562f`, `#1a211d`); the renderer embeds Inter Regular 400 and Bold 700. The static example `assets/og-example.png` is rendered from this implementation without a host label.
