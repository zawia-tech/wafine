import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';
type SharedProps = { variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode };
type ButtonProps = SharedProps &
  (AnchorHTMLAttributes<HTMLAnchorElement> & { href: string } | ButtonHTMLAttributes<HTMLButtonElement> & { href?: never });

const variants: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  outline: 'btn-outline',
};
const sizes: Record<ButtonSize, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' };

/** WaFine action control; retains DaisyUI sizing and visual states. */
export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const classes = `btn ${variants[variant]} ${sizes[size]} min-h-11 ${className}`.trim();
  return 'href' in props && props.href ? (
    <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} href={props.href} className={classes}>
      {children}
    </a>
  ) : (
    <button {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={classes}>
      {children}
    </button>
  );
}
