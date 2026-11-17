// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { LogWeightSheet } from './LogWeightSheet';
import { log } from './testFixtures';

const today = '2026-11-17';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(revalidate?: () => Promise<unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  function Harness() {
    const [open, setOpen] = useState(true);
    useQuery({
      queryKey: ['body-logs', today, today],
      initialData: { logs: [] },
      staleTime: Infinity,
      queryFn: revalidate ?? (() => Promise.resolve({ logs: [] })),
    });
    return open ? <LogWeightSheet logs={[]} today={today} open onOpenChange={setOpen} /> : null;
  }
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '78,4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  return client;
}
it.each(['success', 'error'] as const)(
  'permite cerrar durante el guardado y avisa %s después de desmontarse',
  async (outcome) => {
    const request = deferred<ReturnType<typeof log>>();
    const put = vi.spyOn(api, 'put').mockReturnValue(request.promise);
    const client = setup();
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(client.isMutating()).toBe(1);
    await act(async () => {
      if (outcome === 'success') request.resolve(log(today, 78.4));
      else request.reject(new Error('Sin conexión'));
    });
    expect(
      await screen.findByText(
        outcome === 'success' ? 'Guardaste tu registro' : /No se pudo guardar el registro/,
      ),
    ).toBeTruthy();
    await waitFor(() => expect(client.isMutating()).toBe(0));
  },
);
it('conserva el borrador y muestra el error si la hoja sigue abierta', async () => {
  vi.spyOn(api, 'put').mockRejectedValue(new Error('Sin conexión'));
  setup();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect((screen.getByLabelText('Peso') as HTMLInputElement).value).toBe('78,4');
  expect(screen.getByRole('status').textContent).toContain('No se pudo guardar el registro');
});
it('permite cerrar mientras revalida y luego informa el éxito', async () => {
  const refresh = deferred<unknown>();
  vi.spyOn(api, 'put').mockResolvedValue(log(today, 78.4));
  const revalidate = vi.fn().mockReturnValue(refresh.promise);
  const client = setup(revalidate);
  await waitFor(() => expect(revalidate).toHaveBeenCalled());
  expect(client.isMutating()).toBe(1);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await act(async () => refresh.resolve({ logs: [log(today, 78.4)] }));
  expect(await screen.findByText('Guardaste tu registro')).toBeTruthy();
});
