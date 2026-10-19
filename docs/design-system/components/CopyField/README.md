# CopyField
A labelled, read-only code value with a Copy button, for connector URLs, snippets and freshly minted API keys.

Source: `src/components/copy-field.tsx`.

- **Props:** `label`, `value`, `secret?` — a value shown only once gets a `warning` border on a `warning`/10 tint.
- Value in `code` style on `base-200` with a `base-300` border, horizontally scrollable, never wrapped.
- The button is `btn-ghost btn-sm` at 44px height; its label flips "Copy" → "Copied" for 1.5s.
