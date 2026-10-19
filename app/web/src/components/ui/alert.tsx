import type { HTMLAttributes } from 'react';

type AlertProps = HTMLAttributes<HTMLDivElement> & { variant?: 'info' | 'success' | 'warning' | 'error' };

export function Alert({ variant = 'info', className = '', ...props }: AlertProps) {
  return <div {...props} className={`alert alert-${variant} ${className}`.trim()} />;
}
