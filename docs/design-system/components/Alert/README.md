# Alert
A full-width message box for form errors, confirmations and notices.

Live primitive: `app/web/src/components/ui/alert.tsx`; used for waitlist success and form errors.

- **Props:** `variant` (`info` default, `success`, `warning`, `error`) and native div attributes.

- Radius `rounded-box`, padding `space-4`, `body-sm` text.
- One sentence, plain: "Something went wrong. Please try again in a moment." Success copy states the outcome: "You are on the list."
- Place errors directly above the action that failed. Use `role="alert"` for errors.
