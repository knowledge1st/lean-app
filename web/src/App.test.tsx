// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';

const mounted = vi.hoisted(() => vi.fn());
vi.mock('./auth/AuthProvider', async () => {
  const { useEffect } = await import('react');
  return {
    AuthProvider: ({ children }: { children: import('react').ReactNode }) => {
      useEffect(() => {
        mounted();
      }, []);
      return children;
    },
    useAuth: () => ({ status: 'authenticated' }),
  };
});
vi.mock('./pages/Hoy', () => ({ Hoy: () => <h1>Diario</h1> }));
vi.mock('./pages/Plan', () => ({ Plan: () => <h1>Tu plan</h1> }));
vi.mock('./pages/Login', () => ({ Login: () => <h1>Ingresá</h1> }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

it('conserva el layout y la sesión al navegar y enfoca el contenido nuevo', async () => {
  window.history.replaceState(null, '', '/#/hoy');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  render(<App />);
  const main = screen.getByRole('main');
  const nav = screen.getByRole('navigation');
  expect(screen.getByRole('heading', { name: 'Diario' })).toBeTruthy();
  expect(window.scrollTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Plan' }));
  expect(await screen.findByRole('heading', { name: 'Tu plan' })).toBeTruthy();
  expect(screen.getByRole('main')).toBe(main);
  expect(screen.getByRole('navigation')).toBe(nav);
  expect(document.activeElement).toBe(main);
  expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
  expect(mounted).toHaveBeenCalledOnce();
});
