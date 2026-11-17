// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatWeekRange } from '../../lib/date';
import { CheckinHistory } from './CheckinHistory';
import { checkin } from './testFixtures';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <CheckinHistory />
    </QueryClientProvider>,
  );
}
it('muestra semana, resultado, propuesta y decisión', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    checkins: [
      checkin,
      { ...checkin, id: 'seen', status: 'on_track', resolvedAt: checkin.createdAt },
      { ...checkin, id: 'dismissed', status: 'insufficient_data', resolvedAt: checkin.createdAt },
    ],
  });
  setup();
  expect(await screen.findByText('Ajuste propuesto: de 2.000 a 1.850 kcal')).toBeTruthy();
  expect(screen.getAllByText('Semana del 9 al 15 de noviembre')).toHaveLength(3);
  expect(screen.getByText('Pendiente')).toBeTruthy();
  expect(screen.getByText('Visto')).toBeTruthy();
  expect(screen.getByText('Descartado')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/api/checkins?limit=10');
});
it('muestra carga y vacío', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ checkins: [] });
  const { container } = setup();
  expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  expect(
    await screen.findByText(
      'Todavía no hay revisiones. La primera aparece después de tu primera semana completa.',
    ),
  ).toBeTruthy();
});
it('ofrece reintento ante error', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ checkins: [] });
  setup();
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText(/Todavía no hay revisiones/);
  expect(get).toHaveBeenCalledTimes(2);
});
it('formatea semanas entre meses y años con UTC', () => {
  expect(formatWeekRange('2026-10-26', '2026-11-01')).toBe(
    'Semana del 26 de octubre al 1 de noviembre',
  );
  expect(formatWeekRange('2026-12-28', '2027-01-03')).toBe(
    'Semana del 28 de diciembre de 2026 al 3 de enero de 2027',
  );
});
