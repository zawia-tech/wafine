# Logos

The WaFine bubble mark and app icons, copied from `app/web/public` and `src/components/brand.tsx`.

- `wafine-mark.svg` — the lockup mark (bubble + `وافين`, 512 grid). In the app it is drawn with `currentColor` = `primary` and the word in `primary-content`; this file bakes the light values (`#1c5c42` / `#fcfaf6`).
- `wafine-app-icon.svg` — the **tiny-size** mark for `/icon.svg` and the favicon: the bubble alone, no letters, on a pine squircle (`rx 112`), scaled for legibility at 16–32px.
- `wafine-app-icon.png` — 512×512 app icon, lettered: a pine squircle holding the cream bubble and the ink `وافين`.
- `wafine-apple-icon.png` — 180×180 Apple touch icon, lettered.

Pair the mark with the wordmark `WaFine` in Fredoka 600, tracking-tight, 8px gap. The Arabic
lettering is Noto Kufi Arabic Black (SIL Open Font License), shaped with HarfBuzz and used
verbatim — never hand-draw or mirror it. The geometry lives once in
`app/web/src/lib/brand-paths.ts` and is shared by the app lockup, the OG card and these assets.
