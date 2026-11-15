import type { ComponentProps } from 'react';
import { Button } from './Button';

export type ErrorStateProps = ComponentProps<'div'> & { message: string; onRetry?: () => void };

export function ErrorState({ message, onRetry, className = '', ...props }: ErrorStateProps) {
  return (
    <div
      {...props}
      role="alert"
      className={`space-y-4 rounded-2xl border border-danger bg-surface p-5 ${className}`}
    >
      <p className="text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
