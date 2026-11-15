// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { RequireAuth, RedirectIfAuthenticated } from './RequireAuth';
import { jsonResponse, renderAuth, testUser } from './testUtils';
import { getToken, setToken } from '../lib/session';

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

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}
function routes(path = '/hoy') {
  return renderAuth(
    <>
      <Location />
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/hoy" element={<p>Contenido protegido</p>} />
        </Route>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<p>Login</p>} />
        </Route>
      </Routes>
    </>,
    path,
  );
}

it('sin token redirige al login sin consultar la API', async () => {
  routes();
  expect(await screen.findByText('Login')).toBeTruthy();
  expect(screen.getByTestId('location').textContent).toBe('/login');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('restaura la sesión y muestra solo el esqueleto mientras carga', async () => {
  setToken('token');
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  routes();
  expect(screen.getByLabelText('Cargando').getAttribute('aria-busy')).toBe('true');
  expect(screen.queryByText('Login')).toBeNull();
  expect(screen.queryByText('Contenido protegido')).toBeNull();
  resolve(jsonResponse(testUser));
  expect(await screen.findByText('Contenido protegido')).toBeTruthy();
  expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost/api/me');
});

it('un 401 borra el token y vuelve al login', async () => {
  setToken('expired');
  fetchMock.mockResolvedValue(
    jsonResponse({ error: { code: 'unauthorized', message: 'Sesión vencida' } }, 401),
  );
  routes();
  expect(await screen.findByText('Login')).toBeTruthy();
  expect(getToken()).toBeNull();
});

it('con sesión redirige del login a hoy', async () => {
  setToken('token');
  fetchMock.mockResolvedValue(jsonResponse(testUser));
  routes('/login');
  expect(await screen.findByText('Contenido protegido')).toBeTruthy();
  expect(screen.getByTestId('location').textContent).toBe('/hoy');
});

it('conserva el token ante error de red y permite reintentar', async () => {
  setToken('token');
  fetchMock
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(jsonResponse(testUser));
  routes();
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  expect(getToken()).toBe('token');
  await waitFor(() => expect(screen.getByText('Contenido protegido')).toBeTruthy());
});
