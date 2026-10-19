# Brand
The WaFine lockup: the bubble mark carrying the Arabic wordmark `وافين`, plus the `WaFine` wordmark.

Source: `src/components/brand.tsx` (`Brand`, `BrandMark`), geometry in `src/lib/brand-paths.ts`.

- **Props:** `href?` (wraps it in a 44px-tall link labelled "WaFine home"), `size?` (mark px, default 24), `className?`, `inverted?` (swaps the two theme roles for the dark brand bands).
- The mark is one SVG with two paths: the bubble fills `currentColor` (set to `primary` via `text-primary`) and the word fills `primary-content`. `inverted` flips them to `neutral-content` / `neutral` for the footer and waitlist bands. Recolour by changing the roles, never by editing paths.
- The Arabic lettering is the shaped Noto Kufi Arabic Black outline (SIL OFL), used verbatim; never hand-draw or mirror it. Placement is a translate+scale transform only.
- Wordmark is `WaFine` in **Fredoka 600 everywhere**, tracking-tight. The site header uses the live `Brand` lockup. Use 24px in the header, larger only on OG cards. Gap to wordmark is `space-2`.
