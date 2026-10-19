'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Labelled, copy-to-clipboard code field used by the connection snippets.
 *
 * `secret` marks a value that is shown only once (a fresh API key) — it gets a warning tint so
 * it stands out from the ordinary URLs around it. `multiline` renders long values (SVG source)
 * as a bounded, scrollable block instead of a single-line field.
 */
export function CopyField({
  label,
  value,
  secret = false,
  multiline = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
  multiline?: boolean;
}) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-base-content/75">{label}</div>
      <div className="flex items-center gap-2">
        {multiline ? (
          <pre className="max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-box border border-base-300 bg-base-200 px-3 py-2 text-xs">
            <code>{value}</code>
          </pre>
        ) : (
          <code
            className={`min-w-0 flex-1 overflow-x-auto rounded-field border px-2 py-2 text-xs ${
              secret ? 'border-warning bg-warning/10' : 'border-base-300 bg-base-200'
            }`}
          >
            {value}
          </code>
        )}
        <Button type="button" onClick={copy} aria-label={t('copyLabel', { label })} variant="ghost" size="sm" className="shrink-0 self-start">
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
    </div>
  );
}
