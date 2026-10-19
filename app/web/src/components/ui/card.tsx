import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'bordered' };

export function Card({ variant = 'default', className = '', ...props }: CardProps) {
  const border = variant === 'bordered' ? 'border border-base-300' : '';
  return <div {...props} className={`card bg-base-100 ${border} ${className}`.trim()} />;
}
