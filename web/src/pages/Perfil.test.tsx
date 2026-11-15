// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
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
  fetchMock.mockResolvedValueOnce(jsonResponse(testUser));
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
