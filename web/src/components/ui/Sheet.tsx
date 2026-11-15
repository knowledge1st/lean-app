import * as Dialog from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { Button } from './Button';

export type SheetProps = Omit<ComponentProps<typeof Dialog.Content>, 'title'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
};

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  ...props
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          {...props}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl ${className}`}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-2 text-sm text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Cerrar">
                ✕
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
