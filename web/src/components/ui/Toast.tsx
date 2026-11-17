import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
type ToastAction = { label: string; onAction: () => void };
const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{
    message: string;
    action?: ToastAction;
    id: number;
  } | null>(null);
  const show = useCallback(
    (message: string, action?: ToastAction) =>
      setNotice({ message, ...(action ? { action } : {}), id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.action ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-lg"
      >
        {notice && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-xl">
            <p>{notice.message}</p>
            {notice.action && (
              <Button
                variant="ghost"
                onClick={() => {
                  setNotice(null);
                  notice.action?.onAction();
                }}
              >
                {notice.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
