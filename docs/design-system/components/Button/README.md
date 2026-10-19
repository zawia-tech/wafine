# Button
daisyUI `btn` in four roles: `btn-primary` (one per view), `btn-outline` (secondary CTA), `btn-ghost` (nav, icon and toolbar actions) and `btn-error` (destructive confirm).

Live primitive: `app/web/src/components/ui/button.tsx`; used by marketing hero/header, CopyField, and waitlist form.

- **Props:** `variant` (`primary` default, `secondary`, `ghost`, `outline`), `size` (`md` default, `sm`, `lg`), plus native button or anchor attributes.

- Default height 48px; force `min-h-11` (44px) on links styled as buttons. `btn-sm` (32px) only for pointer-first desktop nav.
- Labels are verbs in sentence case: "Join the waitlist", "Read the docs", "Log out".
- Loading: swap the label for `loading loading-spinner loading-sm` and disable.
- Hover: `primary` → `primary-hover`. Focus: the global 2px `focus-ring`.
