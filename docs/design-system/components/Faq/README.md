# Faq
A stacked disclosure list of questions and answers.

Source: `src/components/marketing/faq.tsx`.

- Native `<details>/<summary>`; the first item opens by default. Rows are at least 44px, padded `space-4` inline.
- One `rounded-box` container with a `base-300` border and dividers between rows.
- Question in `body` weight 500; answer in `body-sm` muted. Chevron (16px, muted) rotates 180° when open.
- Answers are honest, even when the answer is "yes, there's a risk".
