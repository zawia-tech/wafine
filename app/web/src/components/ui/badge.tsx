import type { HTMLAttributes } from 'react';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'primary' | 'secondary' | 'neutral' | 'outline';
  size?: 'sm' | 'md' | 'lg';
};

const variants = { primary: 'badge-primary', secondary: 'badge-secondary', neutral: 'badge-neutral', outline: 'badge-outline' };
const sizes = { sm: 'badge-sm', md: '', lg: 'badge-lg' };

export function Badge({ variant = 'secondary', size = 'md', className = '', ...props }: BadgeProps) {
  return <span {...props} className={`badge ${variants[variant]} ${sizes[size]} ${className}`.trim()} />;
}
