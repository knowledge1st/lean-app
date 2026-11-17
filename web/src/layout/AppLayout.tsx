import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { ScreenSkeleton } from '../components/ui/ScreenSkeleton';

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className="outline-none mx-auto w-full max-w-3xl px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6"
      >
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<ScreenSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
