# Card
The flat bordered card used for features, steps, auth and settings panels.

Live primitive: `app/web/src/components/ui/card.tsx`; used by the marketing feature grid, connector panel, and waitlist panel.

- **Props:** `variant` (`default` or `bordered`), native div attributes, and children.

- `card border border-base-300 bg-base-100`, radius `rounded-box`, body padding `space-8`, inner gap `space-3`.
- Cards sit at `elevation-rest` — a `base-300` border, no shadow. `shadow-raised` appears only on feature-card hover. `shadow-floating` is reserved for overlays and the hero thread. Never a coloured left border.
- Feature card: `label` heading + `body-sm` muted body. Step card: a `badge-neutral` number, `card-title` heading, muted body.
- Grids: 1 / 2 / 3 columns, `space-5` gap, on a `base-200` band.
