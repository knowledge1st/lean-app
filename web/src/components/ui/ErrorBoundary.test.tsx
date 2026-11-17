// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('muestra el error y permite volver a renderizar', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let broken = true;
  function Content() {
    if (broken) throw new Error('Render failed');
    return <p>Recuperado</p>;
  }
  render(
    <ErrorBoundary>
      <Content />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert').textContent).toContain('Algo salió mal.');
  expect(screen.queryByRole('button', { name: 'Recargar la app' })).toBeNull();
  broken = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(screen.getByText('Recuperado')).toBeTruthy();
});

it.each([
  'Failed to fetch dynamically imported module',
  'Loading chunk 3 failed.',
  'Importing a module script failed.',
])('ofrece recargar ante un error de módulo (%s)', (message) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Content(): never {
    throw new Error(message);
  }
  render(
    <ErrorBoundary>
      <Content />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('button', { name: 'Recargar la app' })).toBeTruthy();
});

it('reinicia al cambiar la ruta sin desmontar contenido sano', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const mounted = vi.fn();
  function Content({ broken }: { broken: boolean }) {
    if (broken) throw new Error('Render failed');
    return <input aria-label="Contenido" ref={mounted} />;
  }
  const { rerender } = render(
    <ErrorBoundary resetKey="/hoy">
      <Content broken={false} />
    </ErrorBoundary>,
  );
  const input = screen.getByRole('textbox');
  rerender(
    <ErrorBoundary resetKey="/plan">
      <Content broken={false} />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('textbox')).toBe(input);
  expect(mounted).toHaveBeenCalledTimes(1);
  rerender(
    <ErrorBoundary resetKey="/plan">
      <Content broken />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toBeTruthy();
  rerender(
    <ErrorBoundary resetKey="/hoy">
      <Content broken={false} />
    </ErrorBoundary>,
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('textbox')).toBeTruthy();
});
