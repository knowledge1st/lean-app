// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jsonResponse } from '../../auth/testUtils';
import { WeekBudgetBar } from './WeekBudgetBar';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(date = '2027-01-03') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <WeekBudgetBar date={date} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}
it.each([
  [4550, 9450, 'Te quedan 9.450 kcal esta semana', 32.5],
  [14300, -300, 'Te pasaste 300 kcal esta semana', 100],
  [14000, 0, 'Te quedan 0 kcal esta semana', 100],
  [0, 14000, 'Te quedan 14.000 kcal esta semana', 0],
])(
  'presenta el presupuesto con %s kcal consumidas',
  async (eatenKcal, remainingKcal, text, percent) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ budgetKcal: 14000, eatenKcal, remainingKcal }));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = setup();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('week=2026-W53');
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuemax')).toBe('14000');
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.min(eatenKcal, 14000)));
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${percent}%`);
    client.clear();
  },
);
it('oculta el presupuesto sin meta', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ budgetKcal: null })));
  const { client, container } = setup();
  await vi.waitFor(() => expect(container.innerHTML).toBe(''));
  client.clear();
});
it('muestra un esqueleto durante la carga', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => new Promise(() => {})),
  );
  const { client } = setup();
  expect(screen.getByLabelText('Cargando presupuesto semanal')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  client.clear();
});
it('permite reintentar un error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(jsonResponse({ budgetKcal: 14000, eatenKcal: 4550, remainingKcal: 9450 })),
  );
  const { client } = setup();
  expect(await screen.findByText('No se pudo cargar el presupuesto semanal.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Te quedan 9.450 kcal esta semana')).toBeTruthy();
  client.clear();
});
it('consulta la semana nueva al cambiar la fecha visible', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(jsonResponse({ budgetKcal: 14000, eatenKcal: 4550, remainingKcal: 9450 }));
  vi.stubGlobal('fetch', fetchMock);
  const { client, rerender } = setup();
  await screen.findByText('Te quedan 9.450 kcal esta semana');
  rerender(
    <QueryClientProvider client={client}>
      <WeekBudgetBar date="2027-01-04" />
    </QueryClientProvider>,
  );
  await vi.waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('week=2027-W01'));
  client.clear();
});
