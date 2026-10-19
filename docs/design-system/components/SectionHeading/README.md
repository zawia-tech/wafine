# SectionHeading
The eyebrow + h2 + optional intro block that opens every marketing section.

Live primitive: `app/web/src/components/ui/section-heading.tsx`; used by all marketing section introductions.

- **Props:** `eyebrow`, `heading`, `intro?`, `align?` (`center` default, capped at `prose-width`; `left` capped at 576px).
- `eyebrow` style in `secondary` (clay), then `heading` (`space-3` above) in the display face, intro in `body` muted (`space-4` above).
- The surrounding marketing `Section` takes tone `base-100` | `base-200` | `pine` (the dark `neutral` band), a top border and `space-14`/`space-20` vertical padding.
