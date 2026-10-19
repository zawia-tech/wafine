# AppHeader
The sticky app navbar: brand, account summary, page links, theme toggle and log out.

Source: `src/components/app-header.tsx`.

- **Props:** `phone?` (the bound number, shown after the email as "email · +212…").
- `header-height` min, `base-100` at 95% + backdrop blur, `base-300` bottom border.
- Desktop links are `btn-ghost btn-sm`, the current one `btn-active` with `aria-current="page"`.
- Below `md`, a menu button opens a `rounded-box` panel with `shadow-floating` and 48px rows; Esc closes and returns focus.
