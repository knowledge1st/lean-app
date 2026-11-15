import type { ComponentProps, ReactNode } from 'react';

export type EmptyStateProps = Omit<ComponentProps<'div'>, 'title'> & {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-5 py-12 text-center ${className}`}
      {...props}
    >
      {icon && (
        <div className="text-accent" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
