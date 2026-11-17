import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, CSSProperties } from 'react';
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
  style,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onFocusCapture,
  ...props
}: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [viewportStyle, setViewportStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const update = () => {
      setViewportStyle({
        maxHeight: `${viewport.height * 0.9}px`,
        bottom: `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`,
      });
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && contentRef.current?.contains(activeElement)) {
        activeElement.scrollIntoView?.({ block: 'nearest' });
      }
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          {...props}
          style={{ ...style, ...viewportStyle }}
          onOpenAutoFocus={(event) => {
            openerRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            event.preventDefault();
            if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
          }}
          onFocusCapture={(event) => {
            onFocusCapture?.(event);
            if (
              event.target instanceof HTMLElement &&
              event.target.matches('input, textarea, select')
            ) {
              event.target.scrollIntoView?.({ block: 'nearest' });
            }
          }}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl ${className}`}
        >
          <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
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
          <div ref={contentRef} className="min-h-0 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
