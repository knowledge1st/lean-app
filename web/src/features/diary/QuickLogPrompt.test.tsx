// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { QuickLogPrompt } from './QuickLogPrompt';
import { QUICK_LOG_IDLE_MS, QUICK_LOG_STORAGE_KEY, readQuickLogState } from './quickLog';
import { addDays, todayLocal } from '../../lib/date';

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  localStorage.clear();
  vi.restoreAllMocks();
});
function day(entries: Entry[] = []): DaySummary {
  return {
    date: todayLocal(),
    target: null,
    waterMl: 0,
    exerciseKcal: 0,
    eaten: ZERO_MACROS,
    planned: ZERO_MACROS,
    meals: MEALS.map((meal) => ({
      meal,
      eaten: ZERO_MACROS,
      planned: ZERO_MACROS,
      entries: entries.filter((entry) => entry.meal === meal),
    })),
  };
}
function setup(client = new QueryClient(), summary = day()) {
  clients.push(client);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  return render(
    <QueryClientProvider client={client}>
      <QuickLogPrompt ready summary={summary} onChoose={vi.fn()} />
    </QueryClientProvider>,
  );
}
it('does not renew the timestamp on suppressed mounts every two hours', async () => {
  const initial = Date.now();
  let now = initial;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  localStorage.setItem(
    QUICK_LOG_STORAGE_KEY,
    JSON.stringify({ lastShownAt: initial, lastHiddenAt: 0 }),
  );
  const first = setup();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(readQuickLogState(localStorage)?.lastShownAt).toBe(initial);
  first.unmount();
  now += 2 * 60 * 60 * 1000;
  const second = setup();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(readQuickLogState(localStorage)?.lastShownAt).toBe(initial);
  second.unmount();
  now += 2 * 60 * 60 * 1000;
  setup();
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(readQuickLogState(localStorage)?.lastShownAt).toBe(now);
  now += 1000;
  fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
  expect(readQuickLogState(localStorage)?.lastShownAt).toBe(now);
});
it.each(['Ejercicio', 'Check-in'])(
  'waits until the %s dialog closes and then reevaluates',
  async (title) => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', title);
    document.body.append(dialog);
    setup();
    expect(screen.queryByRole('dialog', { name: '¿Querés cargar alguna comida?' })).toBeNull();
    expect(readQuickLogState(localStorage)?.lastShownAt).toBe(0);
    await act(async () => dialog.remove());
    expect(
      await screen.findByRole('dialog', { name: '¿Querés cargar alguna comida?' }),
    ).toBeTruthy();
  },
);
it('suppresses a recent eaten entry cached under another day without recording a presentation', () => {
  const client = new QueryClient();
  const date = addDays(todayLocal(), -1);
  client.setQueryData(['summary', 'day', date], {
    ...day([
      { date, meal: 'dinner', status: 'eaten', createdAt: new Date().toISOString() } as Entry,
    ]),
    date,
  });
  setup(client);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(readQuickLogState(localStorage)?.lastShownAt).toBe(0);
});
it('mounts after three hours since presentation even when the tab was hidden recently', async () => {
  localStorage.setItem(
    QUICK_LOG_STORAGE_KEY,
    JSON.stringify({ lastShownAt: Date.now() - QUICK_LOG_IDLE_MS, lastHiddenAt: Date.now() }),
  );
  setup();
  expect(await screen.findByRole('dialog')).toBeTruthy();
});

it('checks dialogs again after loading today while viewing another date', async () => {
  let resolve!: (summary: DaySummary) => void;
  vi.spyOn(api, 'get').mockReturnValue(
    new Promise<DaySummary>((done) => {
      resolve = done;
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setup(client, { ...day(), date: addDays(todayLocal(), -1) });
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  document.body.append(dialog);
  await act(async () => resolve(day()));
  await waitFor(() =>
    expect(client.getQueryState(['summary', 'day', todayLocal()])?.fetchStatus).toBe('idle'),
  );
  expect(screen.queryByRole('dialog', { name: '¿Querés cargar alguna comida?' })).toBeNull();
  expect(readQuickLogState(localStorage)?.lastShownAt).toBe(0);
  await act(async () => dialog.remove());
  expect(await screen.findByRole('dialog', { name: '¿Querés cargar alguna comida?' })).toBeTruthy();
});
