// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useAuth } from './AuthProvider';
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
function Account() {
  const { status, logout, logoutAll } = useAuth();
  return (
    <>
      <p>{status}</p>
      <button onClick={() => void logout()}>Salir</button>
      <button onClick={() => void logoutAll()}>Salir de todos</button>
    </>
  );
}

it.each([false, true])(
  'cerrar sesión limpia token y caché incluso sin conexión (todos: %s)',
  async (all) => {
    setToken('token');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(testUser))
      .mockRejectedValueOnce(new TypeError('offline'));
    const { client } = renderAuth(<Account />);
    await screen.findByText('authenticated');
    client.setQueryData(['private-data'], { secret: 'data' });
    fireEvent.click(screen.getByText(all ? 'Salir de todos' : 'Salir'));
    await screen.findByText('anonymous');
    expect(getToken()).toBeNull();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `http://localhost/api/auth/${all ? 'logout-all' : 'logout'}`,
    );
  },
);

it('una sesión vencida notifica al provider y limpia caché', async () => {
  const { api } = await import('../lib/api');
  setToken('token');
  fetchMock.mockResolvedValueOnce(jsonResponse(testUser));
  const { client } = renderAuth(<Account />);
  await screen.findByText('authenticated');
  client.setQueryData(['private-data'], 'secret');
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ error: { code: 'unauthorized', message: 'No' } }, 401),
  );
  await expect(api.get('/api/private')).rejects.toMatchObject({ status: 401 });
  await waitFor(() => expect(screen.getByText('anonymous')).toBeTruthy());
  expect(getToken()).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
