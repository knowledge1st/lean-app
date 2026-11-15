import { useRef } from 'react';
import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);

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
        className="mx-auto w-full max-w-3xl px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6"
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
