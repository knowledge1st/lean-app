import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from './Button';
type ToastAction = { label: string; onAction: () => void };
type Notice = { message: string; action?: ToastAction; id: number };
const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastContext);

function ToastNotice({ notice, dismiss }: { notice: Notice; dismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), notice.action ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-xl">
      <p>{notice.message}</p>
      {notice.action && (
        <Button
          variant="ghost"
          onClick={() => {
            dismiss(notice.id);
            notice.action?.onAction();
          }}
        >
          {notice.action.label}
        </Button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);
  const show = useCallback((message: string, action?: ToastAction) => {
    const notice = { message, ...(action ? { action } : {}), id: nextId.current++ };
    setNotices((current) => [...current, notice]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-lg flex-col gap-2"
      >
        {notices.slice(0, 3).map((notice) => (
          <ToastNotice key={notice.id} notice={notice} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
