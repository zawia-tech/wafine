# WaFine design system

Extracted from `app/web` (Tailwind 3.4 + daisyUI 4.12, themes `wafine-light` / `wafine-dark`) at `7665290`.
This revision (v2) supersedes the v0 snapshot that came from PR #71 (blue, `W` monogram, `WAFINE`, borders-only).

This folder is a snapshot. The source of truth for values stays the code:
`app/web/tailwind.config.ts` and `app/web/src/styles/globals.css`. If they change, re-sync this folder.

| Path | What |
|---|---|
| `README.md` | Brand book: voice, colour, type, spacing, shape, depth, accessibility, iconography |
| `tokens.json` | All tokens, light and dark, plus the elevation scale (Design System artifact format: lists, not DTCG) |
| `components/<Name>/README.md` | Usage guideline per component, with its source file |
| `components/<Name>/preview.html` | Static rendition (needs the artifact's generated `tokens.css`; view it in the artifact) |
| `components/bundle.css` | `wf-*` classes used by the previews only; the product uses daisyUI classes |
| `assets/Logos`, `assets/UiIcons` (the artifact's **Icons** group; renamed because `.gitignore` drops `Icon?`) | The bubble mark, app icons, UI icons (copies of `app/web/public` and inline SVGs) |

The logo is final: the bubble mark carrying the Arabic wordmark `وافين`. The code and these
assets (`app/web/src/components/brand.tsx`, `app/web/src/lib/brand-paths.ts`,
`app/web/public/icon.*`) share one geometry; swap them together if it ever changes.

## Logos

The WaFine bubble mark and app icons, copied from `app/web/public` and `src/components/brand.tsx`.

- `wafine-mark.svg` — the in-app lockup mark (bubble + `وافين`, 512 grid). Drawn with `currentColor` = `primary` and the word in `primary-content`; this file bakes the light values (`#1c5c42` / `#fcfaf6`).
- `wafine-app-icon.svg` — the tiny-size mark behind `/icon.svg` and `favicon.ico`: the bubble alone (no letters) on a pine squircle (`rx 112`).
- `wafine-app-icon.png` — 512×512 app icon, lettered: a pine squircle holding the cream bubble and the ink `وافين`.
- `wafine-apple-icon.png` — 180×180 Apple touch icon, lettered.

Pair the mark with the wordmark `WaFine` in Fredoka 600, tracking-tight, 8px gap. The Arabic
lettering is Noto Kufi Arabic Black (SIL Open Font License), shaped with HarfBuzz and used
verbatim; never hand-draw or mirror it.
