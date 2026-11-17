// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  let created = false;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/profile')
      return jsonResponse(init?.method === 'PUT' ? JSON.parse(String(init.body)) : profile);
    if (path === '/api/goals/active' && created) return jsonResponse({ id: 'created-goal' });
    if (path === '/api/goals/active')
      return jsonResponse({ error: { code: 'goal_not_found', message: 'Sin objetivo' } }, 404);
    if (path === '/api/goals/preview') return jsonResponse(preview);
    if (path === '/api/goals') {
      created = true;
      return jsonResponse({ goal: { id: 'created-goal' }, plan: preview }, 201);
    }
    throw new Error(`Unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
function setup(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
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
  expect(screen.getByText('Elegí una opción')).toBeTruthy();
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
it('oculta la fecha ajustada y bloquea un plan inviable con opciones para cambiarlo', async () => {
  mockApi({
    ...plan,
    adjusted: { targetDate: addDays(todayLocal(), 120) },
    warnings: [{ code: 'rate_capped' }, { code: 'date_unreachable' }],
  });
  stored({ step: 4 });
  setup();
  await screen.findByText(/Con tu gasto diario no es posible/);
  expect(screen.queryByText(/El plan ya usa esa fecha/)).toBeNull();
  expect(screen.queryByText(/Vas a/)).toBeNull();
  expect(screen.queryByText(/Fecha estimada/)).toBeNull();
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
  const implementation = fetchMock.getMockImplementation()!;
  let fail = true;
  fetchMock.mockImplementation((url, init) => {
    if (String(url).endsWith('/api/profile') && fail) {
      fail = false;
      return Promise.reject(new Error('offline'));
    }
    return implementation(url, init);
  });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('serializa un PUT viejo y crea con el perfil del plan actual', async () => {
  const oldPut = deferred<Response>();
  let serverProfile = { ...profile, heightCm: 160 };
  const previews: number[] = [];
  const creations: number[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/profile') {
      if (init?.method === 'PUT') {
        const input = JSON.parse(String(init.body));
        if (input.heightCm === 165) await oldPut.promise;
        serverProfile = input;
      }
      return jsonResponse(serverProfile);
    }
    if (path === '/api/goals/preview') {
      previews.push(serverProfile.heightCm);
      return jsonResponse({ ...plan, daily: { ...plan.daily, kcal: serverProfile.heightCm * 10 } });
    }
    if (path === '/api/goals') {
      creations.push(serverProfile.heightCm);
      return jsonResponse({ goal: {}, plan });
    }
    if (path === '/api/goals/active') return jsonResponse({ id: 'created-goal' });
    throw new Error(`Unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  stored({ step: 4 });
  setup();
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true),
  );
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  fill('Altura', '170');
  next();
  next();
  next();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  await act(async () => {
    oldPut.resolve(jsonResponse(profile));
  });
  await screen.findByText('1.700 kcal');
  expect(serverProfile.heightCm).toBe(170);
  expect(previews).toEqual([170]);
  expect(
    screen.getByText('Vas a reemplazar tu objetivo actual. El anterior queda en el historial.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reemplazar objetivo' }));
  expect(creations).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reemplazo' }));
  await screen.findByRole('heading', { name: 'Hoy destino' });
  expect(creations).toEqual([170]);
});
it('bloquea dos clics síncronos en Empezar y permite reintentar si falla', async () => {
  const fetchMock = mockApi();
  const pending = deferred<Response>();
  const implementation = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    String(url).endsWith('/api/goals') ? pending.promise : implementation(url, init),
  );
  stored({ step: 4 });
  setup();
  await screen.findByText('1.876 kcal');
  const start = screen.getByRole('button', { name: 'Empezar' });
  act(() => {
    start.click();
    start.click();
  });
  await waitFor(() =>
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/goals'))).toHaveLength(
      1,
    ),
  );
  await act(async () => {
    pending.resolve(jsonResponse({ error: { code: 'failure', message: 'Error' } }, 500));
  });
  await screen.findByText(/No pudimos guardar tu objetivo/);
  fetchMock.mockImplementation(implementation);
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  await screen.findByRole('heading', { name: 'Hoy destino' });
});
it('al reabrir sin borrador espera ambos GET frescos aunque haya caché', async () => {
  const fetchMock = mockApi();
  const first = setup();
  await screen.findByLabelText('Altura');
  first.unmount();
  sessionStorage.clear();
  const freshProfile = deferred<Response>();
  const freshGoal = deferred<Response>();
  fetchMock.mockImplementation((url) =>
    String(url).endsWith('/api/profile') ? freshProfile.promise : freshGoal.promise,
  );
  setup(first.client);
  expect(screen.queryByLabelText('Altura')).toBeNull();
  await act(async () => {
    freshProfile.resolve(jsonResponse({ ...profile, heightCm: 170 }));
  });
  expect(screen.queryByLabelText('Altura')).toBeNull();
  await act(async () => {
    freshGoal.resolve(jsonResponse({ progress: { currentWeightKg: 72 } }));
  });
  await screen.findByLabelText('Altura');
  expect((screen.getByLabelText('Altura') as HTMLInputElement).value).toBe('170');
  expect((screen.getByLabelText('Peso actual') as HTMLInputElement).value).toBe('72');
});

it('restablece el perfil del borrador antes de crear y permite reintentar un PUT fallido', async () => {
  const fetchMock = mockApi();
  const implementation = fetchMock.getMockImplementation()!;
  let serverHeight = 165;
  const createdHeights: number[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/api/profile') && init?.method === 'PUT') {
      serverHeight = JSON.parse(String(init.body)).heightCm;
    }
    if (String(url).endsWith('/api/goals')) createdHeights.push(serverHeight);
    return implementation(url, init);
  });
  stored({ step: 4 });
  setup();
  await screen.findByText('1.876 kcal');
  serverHeight = 160;
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  await screen.findByText(/No pudimos guardar tu objetivo/);
  expect(createdHeights).toEqual([]);
  expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  await screen.findByRole('heading', { name: 'Hoy destino' });
  expect(createdHeights).toEqual([165]);
});

it('enfoca el primer control inválido y asocia los errores de opciones y números', async () => {
  mockApi();
  setup();
  await screen.findByLabelText('Altura');
  next();
  const weight = screen.getByLabelText('Peso actual');
  expect(document.activeElement).toBe(weight);
  expect(weight.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(weight.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Indicá tu peso',
  );
  fill('Peso actual', '70');
  next();
  next();
  const option = screen.getByRole('radio', { name: /Llegar a un peso/ });
  expect(document.activeElement).toBe(option);
  expect(document.getElementById(option.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Elegí una opción',
  );
});

it('conserva el plan durante una nueva previsualización y reutiliza el plan reciente', async () => {
  const fetchMock = mockApi();
  stored({ step: 4 });
  setup();
  await screen.findByText('1.876 kcal');
  expect(screen.getByText('Tus datos personales ya quedaron guardados.')).toBeTruthy();
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  next();
  await screen.findByText('1.876 kcal');
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/preview'))).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
  fill('Peso objetivo', '64');
  const pending = deferred<Response>();
  const implementation = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    String(url).endsWith('/preview') ? pending.promise : implementation(url, init),
  );
  next();
  expect(screen.getByText('1.876 kcal')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Empezar' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    pending.resolve(jsonResponse(plan));
  });
});

it('precarga altura y peso con coma decimal', async () => {
  const fetchMock = mockApi();
  const implementation = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) => {
    if (String(url).endsWith('/api/profile'))
      return Promise.resolve(jsonResponse({ ...profile, heightCm: 165.5 }));
    if (String(url).endsWith('/api/goals/active'))
      return Promise.resolve(jsonResponse({ progress: { currentWeightKg: 72.5 } }));
    return implementation(url, init);
  });
  setup();
  await screen.findByLabelText('Altura');
  expect((screen.getByLabelText('Altura') as HTMLInputElement).value).toBe('165,5');
  expect((screen.getByLabelText('Peso actual') as HTMLInputElement).value).toBe('72,5');
});

it('muestra el error de carga con la redacción común', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const { client } = setup();
  expect(await screen.findByText('No se pudo cargar tus datos.')).toBeTruthy();
  client.clear();
});
