import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ message: string; id: number } | null>(null);
  const show = useCallback((message: string) => setNotice({ message, id: Date.now() }), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-lg"
      >
        {notice && (
          <p className="rounded-xl border border-border bg-surface p-4 shadow-xl">
            {notice.message}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
