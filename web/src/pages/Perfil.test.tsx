// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useNavigationType } from 'react-router';
import { jsonResponse, renderAuth, testUser } from '../auth/testUtils';
import { setToken } from '../lib/session';
import { Perfil } from './Perfil';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  localStorage.clear();
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
  expect((await screen.findByRole('alert')).textContent).toBe('Revisá la fecha de nacimiento.');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByLabelText('Altura').getAttribute('value')).toBe('175');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
