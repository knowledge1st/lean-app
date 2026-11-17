// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { ConnectionBanner } from './ConnectionBanner';

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'always' } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ConnectionBanner />
    </QueryClientProvider>,
  );
  return client;
}
async function fail(client: QueryClient, key: string, error: Error) {
  await act(async () => {
    await client
      .fetchQuery({ queryKey: [key], queryFn: () => Promise.reject(error) })
      .catch(() => {});
  });
}
it.each(['network_error', 'timeout_error'])(
  'observa %s y espera a que se recuperen todas las consultas de red',
  async (code) => {
    const client = setup();
    expect(screen.queryByRole('status')).toBeNull();
    await fail(client, 'first', new ApiError(0, code, 'Sin conexión'));
    await fail(client, 'second', new ApiError(0, 'network_error', 'Sin conexión'));
    await fail(client, 'validation', new ApiError(400, 'validation_error', 'Revisá los datos'));
    expect(screen.getByRole('status').textContent).toContain('Sin conexión con el servidor.');
    act(() => {
      client.setQueryData(['first'], 'ok');
    });
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => {
      client.removeQueries({ queryKey: ['second'] });
    });
    expect(screen.queryByRole('status')).toBeNull();
  },
);
it('escucha online/offline y conserva el aviso al volver online con errores de red', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const client = setup();
  expect(screen.getByRole('status')).toBeTruthy();
  await fail(client, 'network', new ApiError(0, 'network_error', 'Sin conexión'));
  act(() => {
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  });
  expect(screen.getByRole('status')).toBeTruthy();
  act(() => {
    client.setQueryData(['network'], 'ok');
  });
  expect(screen.queryByRole('status')).toBeNull();
  act(() => {
    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
  });
  expect(screen.getByRole('status')).toBeTruthy();
  act(() => {
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  });
  expect(screen.queryByRole('status')).toBeNull();
});
it('reintenta todas las consultas con error y conserva las exitosas', async () => {
  const client = setup();
  await fail(client, 'network', new ApiError(0, 'network_error', 'Sin conexión'));
  await fail(client, 'server', new ApiError(500, 'http_error', 'Error del servidor'));
  client.setQueryData(['success'], 'ok');
  const retry = vi.fn().mockResolvedValue('recuperado');
  client.setQueryDefaults(['network'], { queryFn: retry });
  client.setQueryDefaults(['server'], { queryFn: retry });
  // Existing queries retain their configured function.
  for (const query of client.getQueryCache().getAll())
    query.setOptions({ ...query.options, queryFn: retry });
  const refetch = vi.spyOn(client, 'refetchQueries');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar todo' }));
  expect(refetch).toHaveBeenCalledWith({ predicate: expect.any(Function) });
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(retry).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(['success'])).toBe('ok');
});
it('omite errores HTTP, validación y errores ajenos a la red', async () => {
  const client = setup();
  await fail(client, 'http', new ApiError(500, 'http_error', 'Error'));
  await fail(client, 'invalid', new ApiError(200, 'invalid_response', 'Respuesta inválida'));
  await fail(client, 'other', new Error('Error'));
  expect(screen.queryByRole('status')).toBeNull();
});
