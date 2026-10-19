'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

/** Centred card frame for the login and sign-up screens. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div className="absolute right-3 top-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-bold">{title}</h1>
        <div className="card border border-base-300 bg-base-100 shadow-rest">
          <div className="card-body gap-5">{children}</div>
        </div>
      </div>
    </main>
  );
}

export const inputClass = 'input w-full';

export const buttonClass = 'btn btn-primary w-full';

/**
 * Labelled input. A visible label, not just a placeholder: the placeholder disappears as soon
 * as the field has content (and is unreliable for assistive tech), so it only carries the hint.
 */
export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input id={id} className={inputClass} {...input} />
      {hint && <p className="mt-1 text-xs text-base-content/75">{hint}</p>}
    </div>
  );
}
