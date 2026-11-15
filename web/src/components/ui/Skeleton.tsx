import type { ComponentProps } from 'react';

export function Skeleton({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={`h-6 animate-pulse rounded-lg bg-border motion-reduce:animate-none ${className}`}
    />
  );
}
