// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { Checkin } from '@lean/shared';
import { api, ApiError } from '../../lib/api';
import { CheckinCard } from './CheckinCard';
import { checkin } from './testFixtures';
import { checkinMessage } from './messages';
import { ToastProvider } from '../../components/ui/Toast';
import { pendingCheckinKey } from './api';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});
function setup(c: Checkin | null = checkin) {
  vi.spyOn(api, 'get').mockResolvedValue({ checkin: c });
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CheckinCard />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, invalidate: vi.spyOn(client, 'invalidateQueries') };
}
it.each(['adjust', 'on_track', 'insufficient_data'] as const)('muestra %s', async (status) => {
  const c = { ...checkin, status };
  setup(c);
  expect(await screen.findByText(checkinMessage(c))).toBeTruthy();
  expect(screen.getByRole('region').getAttribute('aria-labelledby')).toBeTruthy();
});
it.each([true, false])(
  'resuelve adjust con accept=%s y actualiza la caché correspondiente',
  async (accept) => {
    let finish!: (c: Checkin) => void;
    const post = vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise<Checkin>((resolve) => {
          finish = resolve;
        }),
    );
    const { client, invalidate } = setup();
    await screen.findByText(checkinMessage(checkin));
    fireEvent.click(
      screen.getByRole('button', { name: accept ? 'Aceptar' : 'Mantener como está' }),
    );
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(client.getQueryData(pendingCheckinKey)).toEqual({ checkin: null });
    expect(post).toHaveBeenCalledWith('/api/checkins/checkin-1/resolve', { accept });
    vi.mocked(api.get).mockResolvedValue({ checkin: null });
    await act(async () => {
      finish({ ...checkin, accepted: accept, resolvedAt: checkin.createdAt });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['checkins'] });
    for (const key of [['summary'], ['targets'], ['goals', 'active']]) {
      if (accept) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
      else expect(invalidate).not.toHaveBeenCalledWith({ queryKey: key });
    }
  },
);
it.each(['on_track', 'insufficient_data'] as const)('resuelve %s', async (status) => {
  const post = vi.spyOn(api, 'post').mockResolvedValue(checkin);
  setup({ ...checkin, status });
  await screen.findByText(checkinMessage({ ...checkin, status }));
  vi.mocked(api.get).mockResolvedValue({ checkin: null });
  fireEvent.click(
    screen.getByRole('button', { name: status === 'on_track' ? 'Entendido' : 'Descartar' }),
  );
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/checkins/checkin-1/resolve', {
      accept: status === 'on_track',
    }),
  );
});
it.each([
  new Error('offline'),
  new ApiError(409, 'goal_not_active', 'Sin objetivo'),
  new ApiError(404, 'checkin_not_found', 'No existe'),
])('restaura ante %s y permite reintentar', async (error) => {
  vi.spyOn(api, 'post').mockRejectedValue(error);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudo guardar. Probá de nuevo.',
  );
  expect(screen.getByRole('button', { name: 'Aceptar' }).hasAttribute('disabled')).toBe(false);
});
it('trata already_resolved como completado', async () => {
  vi.spyOn(api, 'post').mockRejectedValue(
    new ApiError(409, 'checkin_already_resolved', 'Resuelto'),
  );
  const { invalidate } = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }));
  vi.mocked(api.get).mockResolvedValue({ checkin: null });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['checkins'] }));
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  for (const key of [['summary'], ['targets'], ['goals', 'active']]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  }
});
it('muestra carga y error con reintento, y oculta la ausencia', async () => {
  const { client } = setup(null);
  expect(screen.getByLabelText('Cargando revisión semanal')).toBeTruthy();
  await waitFor(() => expect(client.getQueryState(pendingCheckinKey)?.status).toBe('success'));
  vi.mocked(api.get).mockRejectedValue(new Error('offline'));
  await act(async () => {
    await client.refetchQueries({ queryKey: pendingCheckinKey });
  });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole('alert')).toBeTruthy();
  vi.mocked(api.get).mockResolvedValue({ checkin });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('button', { name: 'Aceptar' })).toBeTruthy();
});
it.each(['button', 'escape'])('devuelve el foco a Ver detalle al cerrar con %s', async (method) => {
  setup();
  const button = await screen.findByRole('button', { name: 'Ver detalle' });
  button.focus();
  fireEvent.click(button);
  expect(screen.getByRole('dialog')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).not.toBe(button));
  if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  else fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

it('restaura la tarjeta y muestra error al resolver sin conexión', async () => {
  vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
  setup();
  await screen.findByRole('button', { name: 'Aceptar' });
  onlineManager.setOnline(false);
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudo guardar. Probá de nuevo.',
  );
  expect(screen.getByRole('button', { name: 'Aceptar' }).hasAttribute('disabled')).toBe(false);
});
it('muestra las metas propuestas y confirma la aceptación con un toast', async () => {
  vi.spyOn(api, 'post').mockResolvedValue(checkin);
  setup();
  await screen.findByRole('button', { name: 'Aceptar' });
  expect(screen.getByText(/Metas propuestas por día/)).toBeTruthy();
  vi.mocked(api.get).mockResolvedValue({ checkin: null });
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
  expect(await screen.findByText('Actualizaste tus metas')).toBeTruthy();
});
