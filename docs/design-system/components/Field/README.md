# Field
A labelled text input with an optional hint, used on login, sign-up and the waitlist.

Live primitive: `app/web/src/components/ui/field.tsx`; used by all four waitlist fields.

- **Props:** `label` and children (required), `htmlFor?`, `hint?`, and `error?`.
- Label: `body-sm` weight 500, `space-1.5` below. Placeholders carry examples only, never the label.
- Phone numbers are E.164 ("International format, e.g. +212 6XX XX XX XX").
- Errors render as a `text-error` line or an `alert-error` above the submit button.
