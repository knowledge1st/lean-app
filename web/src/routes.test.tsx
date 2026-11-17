// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './routes';

const state = vi.hoisted(() => ({ authenticated: true, broken: false }));
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ status: state.authenticated ? 'authenticated' : 'anonymous' }),
}));
vi.mock('./pages/Hoy', () => ({
  Hoy: () => {
    if (state.broken) throw new Error('Render failed');
    return <h1>Diario</h1>;
  },
}));
vi.mock('./pages/Login', () => ({ Login: () => <h1>Ingresá</h1> }));
vi.mock('./pages/Plan', () => ({ Plan: () => <h1>Tu plan</h1> }));
vi.mock('./pages/Compras', () => ({ Compras: () => <h1>Tus compras</h1> }));
vi.mock('./pages/Progreso', () => ({ Progreso: () => <h1>Tu progreso</h1> }));
vi.mock('./pages/Perfil', () => ({ Perfil: () => <h1>Tu perfil</h1> }));
vi.mock('./pages/ObjetivoNuevo', () => ({ ObjetivoNuevo: () => <h1>Objetivo</h1> }));

function Controls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/hoy?fecha=2026-11-01')}>Cambiar fecha</button>
      <button onClick={() => navigate('/inexistente')}>Ruta desconocida</button>
    </>
  );
}
function setup(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Controls />
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state.authenticated = true;
  state.broken = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('muestra la página inexistente dentro del layout y permite ir a Hoy', async () => {
  setup('/inexistente');
  expect(screen.getByRole('heading', { name: 'No encontramos esta página' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
  expect(document.title).toBe('Página no encontrada · Lean');
  const link = screen.getByRole('link', { name: 'Ir a Hoy' });
  expect(link.className).toContain('min-h-11');
  fireEvent.click(link);
  expect(await screen.findByRole('heading', { name: 'Diario' })).toBeTruthy();
  expect(document.title).toBe('Hoy · Lean');
});

it('protege la ruta inexistente y conserva la redirección de raíz a Hoy', async () => {
  const view = setup('/');
  expect(await screen.findByRole('heading', { name: 'Diario' })).toBeTruthy();
  view.unmount();
  state.authenticated = false;
  setup('/inexistente');
  expect(await screen.findByRole('heading', { name: 'Ingresá' })).toBeTruthy();
  expect(document.title).toBe('Ingresar · Lean');
});

it('mueve scroll y foco solo al cambiar de pathname', async () => {
  setup('/hoy');
  expect(window.scrollTo).not.toHaveBeenCalled();
  const dateButton = screen.getByRole('button', { name: 'Cambiar fecha' });
  dateButton.focus();
  fireEvent.click(dateButton);
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(dateButton);
  fireEvent.click(screen.getByRole('link', { name: 'Plan' }));
  expect(screen.getByRole('status', { name: 'Cargando pantalla' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
  expect(await screen.findByRole('heading', { name: 'Tu plan' })).toBeTruthy();
  expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(document.title).toBe('Plan · Lean');
});

it('conserva la barra al fallar una pantalla y reinicia el boundary al navegar', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.broken = true;
  setup('/hoy');
  expect(screen.getByRole('alert').textContent).toContain('Algo salió mal.');
  expect(screen.getByRole('navigation')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ruta desconocida' }));
  expect(screen.getByRole('heading', { name: 'No encontramos esta página' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each([
  ['/compras', 'Compras'],
  ['/progreso', 'Progreso'],
  ['/perfil', 'Perfil'],
  ['/objetivo/nuevo', 'Tu objetivo'],
])('actualiza el título para %s', async (path, title) => {
  setup(path);
  await act(async () => {});
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: 'Cargando pantalla' })).toBeNull(),
  );
  expect(document.title).toBe(`${title} · Lean`);
});
