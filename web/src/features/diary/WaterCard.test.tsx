// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEALS, ZERO_MACROS, type DaySummary } from '@lean/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { WaterCard } from './WaterCard';
import { summaryKey } from './api';
import { waterKey } from './activityApi';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const date = '2026-11-14';
const summary: DaySummary = {
  date,
  waterMl: 1000,
  exerciseKcal: 0,
  target: { ...ZERO_MACROS, waterMl: 2500 },
  eaten: ZERO_MACROS,
  planned: ZERO_MACROS,
  meals: MEALS.map((meal) => ({ meal, eaten: ZERO_MACROS, planned: ZERO_MACROS, entries: [] })),
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(summaryKey(date), summary);
  client.setQueryData(waterKey(date), { date, ml: 1000 });
  vi.spyOn(api, 'get').mockImplementation(async () => summary as never);
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <WaterCard date={date} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
function deferred() {
  let resolve!: (value: { date: string; ml: number }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ date: string; ml: number }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it('suma al instante en ambas cachés y deshace aun con la suma pendiente', async () => {
  const first = deferred(),
    undo = deferred();
  const post = vi
    .spyOn(api, 'post')
    .mockImplementationOnce(() => first.promise as never)
    .mockImplementationOnce(() => undo.promise as never);
  const { client } = setup();
  fireEvent.click(screen.getByText('+250 ml'));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1250);
  expect(client.getQueryData<DaySummary>(summaryKey(date))?.waterMl).toBe(1250);
  expect(await screen.findByText('1.250 de 2.500 ml')).toBeTruthy();
  fireEvent.click(screen.getByText('Deshacer'));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1000);
  await act(async () => first.resolve({ date, ml: 1250 }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/api/water', { date, ml: -250 }));
  await act(async () => undo.resolve({ date, ml: 1000 }));
  expect((screen.getByText('Deshacer') as HTMLButtonElement).disabled).toBe(true);
  client.clear();
});
it('encola pulsaciones rápidas y conserva todas al confirmar y fallar', async () => {
  const first = deferred(),
    second = deferred(),
    third = deferred();
  const post = vi
    .spyOn(api, 'post')
    .mockImplementationOnce(() => first.promise as never)
    .mockImplementationOnce(() => second.promise as never)
    .mockImplementationOnce(() => third.promise as never);
  const { client } = setup();
  fireEvent.click(screen.getByText('+250 ml'));
  fireEvent.click(screen.getByText('+500 ml'));
  fireEvent.click(screen.getByText('+250 ml'));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(2000);
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  await act(async () => first.resolve({ date, ml: 1250 }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(2000);
  await act(async () => second.reject(new ApiError(400, 'water_limit', 'limit')));
  expect(await screen.findByText('Llegaste al máximo de agua del día')).toBeTruthy();
  await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1500);
  await act(async () => third.resolve({ date, ml: 1500 }));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1500);
  client.clear();
});
it('revierte el optimismo de un deshacer fallido y permite reintentarlo', async () => {
  const undo = deferred();
  vi.spyOn(api, 'post')
    .mockResolvedValueOnce({ date, ml: 1500 })
    .mockImplementationOnce(() => undo.promise as never);
  const { client } = setup();
  fireEvent.click(screen.getByText('+500 ml'));
  await screen.findByText('1.500 de 2.500 ml');
  fireEvent.click(screen.getByText('Deshacer'));
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1000);
  await act(async () => undo.reject(new Error('offline')));
  await waitFor(() => expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1500));
  expect((screen.getByText('Deshacer') as HTMLButtonElement).disabled).toBe(false);
  client.clear();
});
it('vacía la pila al cambiar de fecha y muestra el total sin meta', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({ date, ml: 1250 });
  const { client, rerender } = setup();
  fireEvent.click(screen.getByText('+250 ml'));
  const next = '2026-11-15';
  client.setQueryData(waterKey(next), { date: next, ml: 500 });
  client.setQueryData(summaryKey(next), { ...summary, date: next, target: null });
  rerender(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <WaterCard date={next} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByText('500 ml')).toBeTruthy();
  expect((screen.getByText('Deshacer') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {});
  client.clear();
});
