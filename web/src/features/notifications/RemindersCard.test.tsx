// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_REMINDERS, REMINDER_SLOTS, type RemindersResponse } from '@lean/shared';
import { api } from '../../lib/api';
import { RemindersCard } from './RemindersCard';

const defaults: RemindersResponse = {
  reminders: REMINDER_SLOTS.map((slot) => ({
    slot,
    ...DEFAULT_REMINDERS[slot],
    message: null,
    defaultMessage: DEFAULT_REMINDERS[slot].message,
  })),
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RemindersCard />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('muestra los recordatorios por defecto y explica cuando el navegador no admite push', async () => {
  vi.spyOn(api, 'get').mockResolvedValue(defaults);
  setup();
  expect(await screen.findByText('Desayuno')).toBeTruthy();
  expect(screen.getByText('Este navegador no admite notificaciones.')).toBeTruthy();
  expect(
    screen.getByRole('switch', { name: 'Recordatorio de Snack' }).getAttribute('aria-checked'),
  ).toBe('false');
  expect((screen.getByLabelText('Hora de Cierre del día') as HTMLInputElement).value).toBe('22:30');
  expect(screen.getByText('Solo si ese día no cargaste nada.')).toBeTruthy();
  expect(screen.getByPlaceholderText(DEFAULT_REMINDERS.lunch.message)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Guardar recordatorios' }).hasAttribute('disabled'),
  ).toBe(true);
});

it('guarda hora, mensaje y estado editados', async () => {
  vi.spyOn(api, 'get').mockResolvedValue(defaults);
  const put = vi.spyOn(api, 'put').mockImplementation(async (_path, body) => ({
    reminders: defaults.reminders.map((item) => {
      const changed = (body as { reminders: { slot: string }[] }).reminders.find(
        (r) => r.slot === item.slot,
      );
      return changed ? { ...item, ...changed } : item;
    }),
  }));
  setup();
  fireEvent.change(await screen.findByLabelText('Hora de Almuerzo'), {
    target: { value: '14:15' },
  });
  fireEvent.change(screen.getByLabelText('Mensaje de Almuerzo'), {
    target: { value: '  ¡A comer!  ' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'Recordatorio de Cena' }));
  expect(screen.queryByLabelText('Mensaje de Cena')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar recordatorios' }));
  await waitFor(() => expect(put).toHaveBeenCalledOnce());
  const sent = (put.mock.calls[0]![1] as { reminders: Record<string, unknown>[] }).reminders;
  expect(sent).toHaveLength(6);
  expect(sent.find((r) => r.slot === 'lunch')).toEqual({
    slot: 'lunch',
    enabled: true,
    time: '14:15',
    message: '¡A comer!',
  });
  expect(sent.find((r) => r.slot === 'dinner')).toMatchObject({ enabled: false, message: null });
  await waitFor(() =>
    expect(
      within(screen.getByRole('list')).getByLabelText('Hora de Almuerzo').getAttribute('value'),
    ).toBe('14:15'),
  );
});
