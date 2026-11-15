import type { ComponentProps } from 'react';

const variants = {
  primary: 'bg-accent text-on-accent hover:opacity-90',
  secondary: 'border border-border bg-surface text-text hover:bg-bg',
  ghost: 'text-accent hover:bg-bg',
  danger: 'bg-danger text-on-accent hover:opacity-90',
};

export type ButtonProps = ComponentProps<'button'> & { variant?: keyof typeof variants };

export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
