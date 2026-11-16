// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Plan } from '@lean/shared';
import { ObjetivoNuevo } from './ObjetivoNuevo';
import { jsonResponse } from '../auth/testUtils';
import { addDays, todayLocal } from '../lib/date';
import { DRAFT_KEY, emptyDraft, type Draft } from '../features/goals/draft';
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const profile = {
  sex: 'female',
  birthDate: '1990-03-12',
  heightCm: 165,
  activityLevel: 'moderate',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};
const plan: Plan = {
  tdee: 2345,
  daily: { kcal: 1876, proteinG: 123, carbsG: 234, fatG: 56, waterMl: 2250 },
  weekly: { kcalBudget: 13132, expectedWeightChangeKg: -0.4 },
  milestones: [{ date: addDays(todayLocal(), 60), expectedWeightKg: 65, kind: 'final' }],
  warnings: [],
};
function mockApi(preview = plan) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/profile')
      return jsonResponse(init?.method === 'PUT' ? JSON.parse(String(init.body)) : profile);
    if (path === '/api/goals/active')
      return jsonResponse({ error: { code: 'goal_not_found', message: 'Sin objetivo' } }, 404);
    if (path === '/api/goals/preview') return jsonResponse(preview);
    if (path === '/api/goals') return jsonResponse({ goal: {}, plan: preview }, 201);
    throw new Error(`Unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/objetivo/nuevo']}>
        <Routes>
          <Route path="/objetivo/nuevo" element={<ObjetivoNuevo />} />
          <Route path="/hoy" element={<h1>Hoy destino</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function about() {
  await waitFor(() =>
    expect((screen.getByLabelText('Altura') as HTMLInputElement).value).toBe('165'),
  );
  fill('Peso actual', '70,5');
  next();
}
it.each(['weight_date', 'composition', 'manual'] as const)(
  'completa %s con valores de API y guarda el cuerpo correcto',
  async (mode) => {
    const fetchMock = mockApi();
    setup();
    await about();
    fireEvent.click(
      screen.getByRole('radio', {
        name: {
          weight_date: /Llegar a un peso/,
          composition: /Cambiar mi composición/,
          manual: /Definir mis números/,
        }[mode],
      }),
    );
    next();
    if (mode === 'weight_date') {
      fill('Peso objetivo', '65');
      fill('Fecha objetivo', addDays(todayLocal(), 60));
    }
    if (mode === 'composition')
      fireEvent.click(screen.getByRole('radio', { name: /Recomposición/ }));
    if (mode === 'manual') {
      fill('Calorías diarias', '2000');
      fill('Proteína', '120');
      fill('Carbohidratos', '250');
      fill('Grasa', '58');
    }
    next();
    await screen.findByText('1.876 kcal');
    expect(screen.getByText('Presupuesto semanal: 13.132 kcal')).toBeTruthy();
    expect(screen.getByText('Gasto diario estimado: 2.345 kcal')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    await screen.findByRole('heading', { name: 'Hoy destino' });
    const goal =
      mode === 'weight_date'
        ? { mode, targetWeightKg: 65, targetDate: addDays(todayLocal(), 60) }
        : mode === 'composition'
          ? { mode, preset: 'recomp' }
          : { mode, kcal: 2000, proteinG: 120, carbsG: 250, fatG: 58 };
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/goals'))!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({ goal, weightKg: 70.5 });
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  },
);
it('valida, conserva al volver atrás y restaura el mismo paso al recargar', async () => {
  mockApi();
  const first = setup();
  await screen.findByLabelText('Peso actual');
  next();
  expect(screen.getByRole('heading', { name: 'Sobre vos' })).toBeTruthy();
  await about();
  next();
  expect(screen.getByText('Elegí qué querés lograr')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /Llegar a un peso/ }));
  next();
  fill('Peso objetivo', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  next();
  expect((screen.getByLabelText('Peso objetivo') as HTMLInputElement).value).toBe('65');
  first.unmount();
  first.client.clear();
  setup();
  expect(screen.getByRole('heading', { name: 'Detalle' })).toBeTruthy();
  expect((screen.getByLabelText('Peso objetivo') as HTMLInputElement).value).toBe('65');
});
function stored(draft: Partial<Draft>) {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      ...emptyDraft,
      sex: 'female',
      birthDate: profile.birthDate,
      heightCm: '165',
      weightKg: '70',
      activityLevel: 'moderate',
      mode: 'weight_date',
      targetWeightKg: '65',
      targetDate: addDays(todayLocal(), 60),
      ...draft,
    }),
  );
}
it('descarta borrador corrupto y no permite saltar pasos inválidos', async () => {
  mockApi();
  sessionStorage.setItem(DRAFT_KEY, '{broken');
  const view = setup();
  await screen.findByLabelText('Peso actual');
  view.unmount();
  view.client.clear();
  stored({ step: 4, heightCm: '0' });
  setup();
  expect(screen.getByRole('heading', { name: 'Sobre vos' })).toBeTruthy();
});
it('muestra fecha ajustada y bloquea un plan inviable con opciones para cambiarlo', async () => {
  mockApi({
    ...plan,
    adjusted: { targetDate: addDays(todayLocal(), 120) },
    warnings: [{ code: 'rate_capped' }, { code: 'date_unreachable' }],
  });
  stored({ step: 4 });
  setup();
  await screen.findByText(/El plan ya usa esa fecha/);
  expect(screen.getByText(/Con tu gasto diario no es posible/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Empezar' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar objetivo' }));
  expect(screen.getByRole('heading', { name: 'Qué querés lograr' })).toBeTruthy();
});
it('guarda perfil cambiado antes de pedir preview y permite reintentar errores', async () => {
  const fetchMock = mockApi();
  stored({ step: 4, heightCm: '170' });
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  setup();
  await screen.findByText(/No pudimos armar tu plan/);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('1.876 kcal');
  const calls = fetchMock.mock.calls;
  const put = calls.findIndex(([, init]) => init?.method === 'PUT');
  const preview = calls.findIndex(([url]) => String(url).endsWith('/preview'));
  expect(put).toBeGreaterThan(0);
  expect(preview).toBeGreaterThan(put);
});
it('permite omitir por ahora', async () => {
  mockApi();
  setup();
  await screen.findByRole('button', { name: 'Omitir por ahora' });
  fireEvent.click(screen.getByRole('button', { name: 'Omitir por ahora' }));
  await screen.findByRole('heading', { name: 'Hoy destino' });
  expect(localStorage.getItem('lean.goalWizard.skipped')).toBe('1');
});
