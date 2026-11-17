// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useNavigationType } from 'react-router';
import { jsonResponse, renderAuth, testUser } from '../auth/testUtils';
import { setToken } from '../lib/session';
import type { ActiveGoal } from '@lean/shared';
import { DRAFT_KEY, emptyDraft, storeDraft } from '../features/goals/draft';
import { ObjetivoNuevo } from './ObjetivoNuevo';
import { Perfil } from './Perfil';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setToken('token');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) =>
    String(url).endsWith('/api/me')
      ? jsonResponse(testUser)
      : jsonResponse({ error: { code: 'not_found', message: 'Sin datos' } }, 404),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function LoginDestination() {
  const navigationType = useNavigationType();
  return <p>Login {navigationType}</p>;
}

async function setup() {
  renderAuth(
    <Routes>
      <Route path="/perfil" element={<Perfil />} />
      <Route path="/login" element={<LoginDestination />} />
    </Routes>,
    '/perfil',
  );
  await screen.findByText('@jose');
  await screen.findByText('Todavía no definiste tu objetivo');
  await screen.findByText('Completá tus datos personales para armar tu plan.');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }));
}

it.each([
  [0, 'Sin conexión. No se pudieron cerrar las otras sesiones; volvé a intentar.'],
  [500, 'No se pudieron cerrar las sesiones. Probá de nuevo.'],
])(
  'muestra el error %s, mantiene la hoja abierta y permite reintentar',
  async (status, message) => {
    await setup();
    if (status === 0) fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    else fetchMock.mockResolvedValueOnce(jsonResponse({}, status));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar todas' }).hasAttribute('disabled')).toBe(
      false,
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas' }));
    expect(await screen.findByText('Login REPLACE')).toBeTruthy();
  },
);

it('muestra Cerrando… hasta recibir 204 y navega a login con replace', async () => {
  await setup();
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  fetchMock.mockReturnValueOnce(response);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas' }));
  expect(screen.getByRole('button', { name: 'Cerrando…' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText('Login REPLACE')).toBeNull();
  await act(async () => {
    resolveResponse(new Response(null, { status: 204 }));
    await response;
  });
  expect(await screen.findByText('Login REPLACE')).toBeTruthy();
});

const profile = {
  sex: 'male',
  birthDate: '1990-05-12',
  heightCm: 175,
  activityLevel: 'light',
  timeZone: 'America/Argentina/Buenos_Aires',
};

async function setupProfile() {
  fetchMock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/api/me')) return jsonResponse(testUser);
    if (String(url).endsWith('/api/profile')) {
      if (options?.method === 'PUT')
        return jsonResponse({ ...profile, heightCm: 180.5, activityLevel: 'moderate' });
      return jsonResponse(profile);
    }
    return jsonResponse({ error: { code: 'goal_not_found', message: 'Sin objetivo' } }, 404);
  });
  const view = renderAuth(<Perfil />, '/perfil');
  await screen.findByText('175 cm');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  return view;
}

it('edita datos personales con PUT, conserva la zona horaria y actualiza la tarjeta y caché', async () => {
  const { client } = await setupProfile();
  fireEvent.change(screen.getByLabelText('Altura'), { target: { value: '180,5' } });
  fireEvent.click(screen.getByLabelText('Activo'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('180,5 cm')).toBeTruthy();
  expect(screen.getByText('Activo')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
  expect(put?.[0]).toBe('http://localhost/api/profile');
  expect(JSON.parse(String(put?.[1]?.body))).toEqual({
    ...profile,
    heightCm: 180.5,
    activityLevel: 'moderate',
  });
  expect(client.getQueryData(['profile'])).toEqual({
    ...profile,
    heightCm: 180.5,
    activityLevel: 'moderate',
  });
});

it('muestra el error del servidor, conserva el formulario y permite reintentar el guardado', async () => {
  await setupProfile();
  fetchMock.mockResolvedValueOnce(
    jsonResponse(
      { error: { code: 'invalid_profile', message: 'Revisá la fecha de nacimiento.' } },
      400,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'No pudimos guardar tus datos. Revisalos y probá de nuevo.',
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByLabelText('Altura').getAttribute('value')).toBe('175');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('Cambiar objetivo precarga perfil y peso frescos con una caché inicial vacía de hace menos de 30 s', async () => {
  const goal: ActiveGoal = {
    id: 'goal',
    mode: 'manual',
    preset: null,
    startDate: '2026-11-01',
    startWeightKg: 80,
    targetWeightKg: null,
    targetDate: null,
    progress: { startWeightKg: 80, currentWeightKg: 76.5, targetWeightKg: null, percent: null },
    target: { kcal: 2000, protein: 140, carbs: 220, fat: 62, waterMl: 2500 },
    milestones: [],
  };
  fetchMock.mockImplementation(async (url) => {
    if (String(url).endsWith('/api/me')) return jsonResponse(testUser);
    if (String(url).endsWith('/api/profile')) return jsonResponse(profile);
    if (String(url).endsWith('/api/goals/active')) return jsonResponse(goal);
    throw new Error(`Unexpected ${url}`);
  });
  const { client } = renderAuth(
    <Routes>
      <Route path="/perfil" element={<Perfil />} />
      <Route path="/objetivo/nuevo" element={<ObjetivoNuevo />} />
    </Routes>,
    '/perfil',
  );
  await screen.findByText('175 cm');
  await screen.findByRole('button', { name: 'Cambiar objetivo' });
  // La primera apertura, antes de crear el perfil y objetivo, dejó ambos vacíos.
  client.setQueryData(['goals', 'wizard', 'initial'], { profile: null, goal: null });
  storeDraft({ ...emptyDraft, heightCm: '190', weightKg: '99' });
  let resolveProfile!: (response: Response) => void;
  let resolveGoal!: (response: Response) => void;
  const freshProfile = new Promise<Response>((resolve) => {
    resolveProfile = resolve;
  });
  const freshGoal = new Promise<Response>((resolve) => {
    resolveGoal = resolve;
  });
  fetchMock.mockImplementation((url) =>
    String(url).endsWith('/api/profile') ? freshProfile : freshGoal,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar objetivo' }));
  expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  expect(screen.queryByLabelText('Altura')).toBeNull();
  await act(async () => {
    resolveProfile(jsonResponse(profile));
  });
  expect(screen.queryByLabelText('Altura')).toBeNull();
  await act(async () => {
    resolveGoal(jsonResponse(goal));
  });
  await screen.findByLabelText('Altura');
  expect((screen.getByLabelText('Altura') as HTMLInputElement).value).toBe('175');
  expect((screen.getByLabelText('Fecha de nacimiento') as HTMLInputElement).value).toBe(
    profile.birthDate,
  );
  expect((screen.getByLabelText('Hombre') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('radio', { name: /Algo activo/ }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect((screen.getByLabelText('Peso actual') as HTMLInputElement).value).toBe('76,5');
  client.clear();
});

it('muestra objetivo, datos personales, recordatorios y cuenta en ese orden', async () => {
  renderAuth(<Perfil />, '/perfil');
  await screen.findByText('@jose');
  expect(
    screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
  ).toEqual(['Mi objetivo', 'Datos personales', 'Recordatorios', 'Cuenta']);
});

it('pide confirmar el cierre de sesión y permite cancelarlo', async () => {
  renderAuth(
    <Routes>
      <Route path="/perfil" element={<Perfil />} />
      <Route path="/login" element={<LoginDestination />} />
    </Routes>,
    '/perfil',
  );
  await screen.findByText('@jose');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/auth/logout'))).toBe(
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
  await screen.findByText('Login REPLACE');
});
