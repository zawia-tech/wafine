'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A destructive button that asks for confirmation in place instead of `window.confirm`.
 *
 * Click → the button is replaced by the question plus Confirm / Cancel. Focus moves to Cancel
 * (the safe default), Esc cancels, and focus returns to the trigger afterwards. All buttons are
 * 44px tall.
 */
export function InlineConfirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  tone = 'error',
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  tone?: 'error' | 'warning' | 'primary';
}) {
  const [asking, setAsking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (asking) cancelRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [asking]);

  function close() {
    restoreFocus.current = true;
    setAsking(false);
  }

  const toneText = { error: 'text-error', warning: 'text-warning', primary: 'text-primary' }[tone];
  const toneBtn = { error: 'btn-error', warning: 'btn-warning', primary: 'btn-primary' }[tone];

  if (!asking) {
    return (
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className={`btn btn-ghost btn-sm h-11 min-h-11 ${toneText}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={question}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <span className="text-sm" aria-live="polite">
        {question}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          void onConfirm();
        }}
        className={`btn btn-sm h-11 min-h-11 ${toneBtn}`}
      >
        {confirmLabel ?? label}
      </button>
      <button ref={cancelRef} type="button" onClick={close} className="btn btn-ghost btn-sm h-11 min-h-11">
        Cancel
      </button>
    </div>
  );
}
