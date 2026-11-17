// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { AppLayout } from './AppLayout';

afterEach(cleanup);
it('muestra el aviso compartido antes del contenido y conserva la navegación', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await client
    .fetchQuery({
      queryKey: ['offline'],
      queryFn: () => Promise.reject(new ApiError(0, 'network_error', 'Sin conexión')),
    })
    .catch(() => {});
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hoy']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/hoy" element={<h1>Hoy</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const main = screen.getByRole('main');
  const banner = screen.getByRole('status');
  expect(main.contains(banner)).toBe(true);
  expect(
    banner.compareDocumentPosition(screen.getByRole('heading', { name: 'Hoy' })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reintentar todo' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
  view.unmount();
  client.clear();
});
