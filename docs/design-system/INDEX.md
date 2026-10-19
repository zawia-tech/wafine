# WaFine design system

Live system: `app/web` (Tailwind CSS 4 + daisyUI 5, themes `wafine-light` / `wafine-dark`).
This documentation revision is v5 (18/10/2026).

The live source of truth is `app/web/src/styles/globals.css`; token inventory and intent live in
`tokens.json` and `README.md`. Keep these synchronized when the code changes.

| Path | What |
|---|---|
| `README.md` | Brand book: voice, colour, type, spacing, shape, depth, accessibility, iconography |
| `tokens.json` | Color, type, spacing, radius, elevation, and motion tokens |
| `app/web/src/components/ui/` | Live typed Button, Badge, Card, Field, Alert, and SectionHeading primitives |
| `components/<Name>/README.md` | Usage notes for live components or related product components |
| `components/<Name>/preview.html` | Static visual reference; not the implementation source |
| `components/bundle.css` | `wf-*` classes for static previews only |
| `assets/og-example.png` | Rendered 1200×630 example from `app/web/src/lib/og.tsx` |
| `app/docs/app/wafine-theme.css` | WaFine Fumadocs colors, typography, and radius in light and dark themes |
| `assets/Logos`, `assets/UiIcons` (the artifact's **Icons** group; renamed because `.gitignore` drops `Icon?`) | The bubble mark, app icons, UI icons (copies of `app/web/public` and inline SVGs) |

The logo is final: the bubble mark carrying the Arabic wordmark `وافين`. The code and these
assets (`app/web/src/components/brand.tsx`, `app/web/src/lib/brand-paths.ts`,
`app/web/public/icon.*`) share one geometry; swap them together if it ever changes.

## Live component inventory

The live primitive API is in `app/web/src/components/ui/`: `Button`, `Badge`, `Card`, `Field`,
`Alert`, and `SectionHeading`. Marketing pages and `CopyField` use these wrappers where their
existing markup matches. Static cards are reference previews only.

## Logos

The WaFine bubble mark and app icons, copied from `app/web/public` and `src/components/brand.tsx`.

- `wafine-mark.svg` — the in-app lockup mark (bubble + `وافين`, 512 grid). Drawn with `currentColor` = `primary` and the word in `primary-content`; this file bakes the light values (`#1c5c42` / `#fcfaf6`).
- `wafine-app-icon.svg` — the tiny-size mark behind `/icon.svg` and `favicon.ico`: the bubble alone (no letters) on a pine squircle (`rx 112`).
- `wafine-app-icon.png` — 512×512 app icon, lettered: a pine squircle holding the cream bubble and the ink `وافين`.
- `wafine-apple-icon.png` — 180×180 Apple touch icon, lettered.

Pair the mark with the wordmark `WaFine` in Fredoka 600, tracking-tight, 8px gap. The Arabic
lettering is Noto Kufi Arabic Black (SIL Open Font License), shaped with HarfBuzz and used
verbatim; never hand-draw or mirror it.
