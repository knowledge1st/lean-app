// @vitest-environment jsdom
import { lazy, Suspense } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChartBoundary } from './ChartBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('contiene un import fallido y permite reintentar recargando', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.fn();
  vi.stubGlobal('location', { reload });
  const Chart = lazy(() => Promise.reject(new Error('chunk unavailable')));
  render(
    <>
      <p>Resumen disponible</p>
      <ChartBoundary>
        <Suspense fallback={<p>Cargando</p>}>
          <Chart />
        </Suspense>
      </ChartBoundary>
    </>,
  );
  expect(await screen.findByText('No se pudo cargar el gráfico')).toBeTruthy();
  expect(screen.getByText('Resumen disponible')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(reload).toHaveBeenCalledOnce();
});
