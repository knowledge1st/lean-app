// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { Login } from './Login';
import { RedirectIfAuthenticated } from '../auth/RequireAuth';
import { jsonResponse, renderAuth, testUser } from '../auth/testUtils';
import { getToken } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup() {
  renderAuth(
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route path="/hoy" element={<p>Hoy autenticado</p>} />
    </Routes>,
    '/login',
  );
}
function submit() {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'jose' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'incorrecta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
}

it('401 conserva el usuario, vacía la contraseña y la enfoca', async () => {
  fetchMock.mockResolvedValue(
    jsonResponse({ error: { code: 'invalid_credentials', message: 'No' } }, 401),
  );
  setup();
  submit();
  expect((await screen.findByRole('alert')).textContent).toBe('Usuario o contraseña incorrectos.');
  expect((screen.getByLabelText('Usuario') as HTMLInputElement).value).toBe('jose');
  expect((screen.getByLabelText('Contraseña') as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(screen.getByLabelText('Contraseña'));
});

it('429 muestra la espera y conserva los campos', async () => {
  fetchMock.mockResolvedValue(
    jsonResponse({ error: { code: 'too_many_requests', message: 'No' } }, 429),
  );
  setup();
  submit();
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Demasiados intentos. Esperá 15 minutos y volvé a probar.',
  );
  expect((screen.getByLabelText('Contraseña') as HTMLInputElement).value).toBe('incorrecta');
});

it('guarda el token y navega a hoy al ingresar', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ token: 'new-token', user: testUser }));
  setup();
  submit();
  expect(await screen.findByText('Hoy autenticado')).toBeTruthy();
  expect(getToken()).toBe('new-token');
  expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost/api/auth/login');
});

it('muestra el error de conexión', async () => {
  fetchMock.mockRejectedValue(new TypeError('offline'));
  setup();
  submit();
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Sin conexión. Revisá tu internet y volvé a intentar.',
  );
});

it('valida los campos vacíos sin consultar la API', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  await waitFor(() => expect(screen.getByText('Ingresá tu usuario.')).toBeTruthy());
  expect(screen.getByText('Ingresá tu contraseña.')).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});
