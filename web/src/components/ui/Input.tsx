import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';

export type InputProps = ComponentProps<'input'> & {
  label?: string;
  error?: string | undefined;
  suffix?: ReactNode;
};

export function Input({
  label,
  error,
  suffix,
  id,
  className = '',
  'aria-describedby': describedBy,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const description =
    [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <div className="min-w-0 space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          {...props}
          id={inputId}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={description}
          className={`min-h-11 w-full min-w-0 rounded-xl border bg-surface px-3 py-2 text-base text-text placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-danger' : 'border-border'} ${suffix ? 'pr-16' : ''} ${className}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
