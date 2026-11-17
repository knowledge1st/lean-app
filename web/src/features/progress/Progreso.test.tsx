// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Progreso } from '../../pages/Progreso';
import { ToastProvider } from '../../components/ui/Toast';
import { todayLocal, addDays } from '../../lib/date';
import { jsonResponse } from '../../auth/testUtils';
import { bodyRangeKey } from './api';
import { log, weekSummary } from './testFixtures';
import { checkin } from '../checkin/testFixtures';
import type { ProgressLog } from './calc';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children, data }: { children: ReactNode; data: unknown }) => (
    <div data-testid="weight-points" data-points={JSON.stringify(data)}>
      {children}
    </div>
  ),
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ x }: { x: number }) => <span data-testid="goal-change" data-x={x} />,
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});
function setup(
  logs: ProgressLog[] = [],
  put: () => Promise<Response> = () => Promise.resolve(jsonResponse({})),
  revisions: (typeof checkin)[] | null = [],
) {
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (options?.method === 'PUT') return put();
    if (url.includes('/checkins?limit='))
      return revisions === null
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(jsonResponse({ checkins: revisions }));
    if (url.includes('/body-logs')) return Promise.resolve(jsonResponse({ logs }));
    if (url.includes('/goals/active'))
      return Promise.resolve(
        jsonResponse({ error: { code: 'not_found', message: 'Sin objetivo' } }, 404),
      );
    if (url.includes('/summary/week')) return Promise.resolve(jsonResponse(weekSummary));
    if (url.includes('/entries')) return Promise.resolve(jsonResponse([]));
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Progreso />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, fetchMock };
}
it('invita a registrar el primer peso y muestra Semana aun sin registros', async () => {
  setup();
  expect(await screen.findByText('Registrá tu primer peso')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Registrar peso' }).length).toBeGreaterThan(0);
  expect(await screen.findByText('1 de 7 días registrados')).toBeTruthy();
  expect(screen.getByText(/Cargá tus medidas/)).toBeTruthy();
});
it('agrega el punto optimista sin recargar, cierra la hoja e invalida al terminar', async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const today = todayLocal();
  const logs: ProgressLog[] = [];
  const { client, fetchMock } = setup(logs, () => pending);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  await screen.findByText('Registrá tu primer peso');
  fireEvent.click(screen.getAllByRole('button', { name: 'Registrar peso' })[0]!);
  fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '78,4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText(/Último peso registrado: 78,4 kg/)).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByTestId('weight-points').getAttribute('data-points')).toContain(
    '"weight":78.4',
  );
  expect(screen.queryByText(/Esperado|Peso esperado/)).toBeNull();
  expect(
    fetchMock.mock.calls.filter(
      ([url]) => url.includes('/body-logs') && !url.includes(`/body-logs/${today}`),
    ),
  ).toHaveLength(1);
  logs.push(log(today, 78.4));
  finish(jsonResponse(logs[0]));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['goals', 'active'] }));
});
it('revierte el punto y avisa con toast si falla', async () => {
  let fail!: (error: Error) => void;
  const pending = new Promise<Response>((_resolve, reject) => {
    fail = reject;
  });
  const { client } = setup([], () => pending);
  await screen.findByText('Registrá tu primer peso');
  fireEvent.click(screen.getAllByRole('button', { name: 'Registrar peso' })[0]!);
  fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '80' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByText(/Último peso registrado: 80 kg/);
  fail(new Error('offline'));
  expect(await screen.findByText(/No se pudo guardar el registro/)).toBeTruthy();
  await screen.findByText('Registrá tu primer peso');
  expect(client.getQueryData(bodyRangeKey(addDays(todayLocal(), -365), todayLocal()))).toEqual({
    logs: [],
  });
});
it('precarga cada último valor conocido, valida y permite cargar solo medidas', async () => {
  let submitted: RequestInit | undefined;
  const { fetchMock } = setup([
    { ...log(addDays(todayLocal(), -1), 80), waistCm: 82 },
    { ...log(todayLocal(), null, null), hipCm: 90 },
  ]);
  await screen.findByText(/Último peso registrado/);
  fireEvent.click(screen.getByRole('button', { name: 'Registrar peso' }));
  expect((screen.getByLabelText('Peso') as HTMLInputElement).value).toBe('80');
  expect((screen.getByLabelText('Cintura') as HTMLInputElement).value).toBe('82');
  expect((screen.getByLabelText('Cadera') as HTMLInputElement).value).toBe('90');
  fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(screen.getByRole('alert').textContent).toContain('Peso: mínimo 25');
  fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => {
    submitted = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')?.[1];
    expect(submitted).toBeTruthy();
  });
  expect(JSON.parse(String(submitted?.body))).toEqual({ waistCm: 82, hipCm: 90 });
});
it('cambiar el rango no vuelve a pedir logs', async () => {
  const { fetchMock } = setup([log(todayLocal(), 80)]);
  await screen.findByText(/Último peso registrado/);
  fireEvent.click(screen.getByRole('button', { name: 'Todo' }));
  expect(screen.getByRole('button', { name: 'Todo' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '3 meses' }));
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/body-logs'))).toHaveLength(1);
});

it('integra historial y marcas de ajustes aceptados en la fecha local', async () => {
  const today = todayLocal();
  setup([log(today, 80)], undefined, [
    { ...checkin, accepted: true, resolvedAt: new Date().toISOString() },
    { ...checkin, id: 'kept', accepted: false, resolvedAt: new Date().toISOString() },
    {
      ...checkin,
      id: 'seen',
      status: 'on_track',
      accepted: true,
      resolvedAt: new Date().toISOString(),
    },
  ]);
  await screen.findByText(/Último peso registrado/);
  expect(await screen.findByRole('heading', { name: 'Revisiones semanales' })).toBeTruthy();
  expect(screen.getByText('Aceptado')).toBeTruthy();
  expect(screen.getAllByTestId('goal-change')).toHaveLength(1);
  expect(screen.getByTestId('goal-change').getAttribute('data-x')).toBe(
    String(Date.parse(`${today}T12:00:00Z`)),
  );
});

it('conserva el gráfico sin marcas si falla el historial', async () => {
  setup([log(todayLocal(), 80)], undefined, null);
  await screen.findByText(/Último peso registrado/);
  expect(await screen.findByText('No se pudieron cargar las revisiones.')).toBeTruthy();
  expect(screen.queryByTestId('goal-change')).toBeNull();
  expect(screen.getByTestId('weight-points')).toBeTruthy();
});
