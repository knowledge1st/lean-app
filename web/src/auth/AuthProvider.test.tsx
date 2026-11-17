// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useAuth } from './AuthProvider';
import { jsonResponse, renderAuth, testUser } from './testUtils';
import { getToken, setToken } from '../lib/session';
import { ApiError } from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const nextUser = { id: 'user-2', username: 'ana', displayName: 'Ana' };

function Account({
  onLogout,
  onError,
}: {
  onLogout?: () => void;
  onError?: (error: unknown) => void;
}) {
  const { status, user, login, logout, logoutAll } = useAuth();
  return (
    <>
      <p>{status}</p>
      <p>{user?.username}</p>
      <button onClick={() => void logout().then(onLogout)}>Salir</button>
      <button onClick={() => void logoutAll().then(onLogout).catch(onError)}>Salir de todos</button>
      <button onClick={() => void login(nextUser.username, 'password')}>Ingresar</button>
    </>
  );
}

it('cerrar sesión limpia token y caché incluso sin conexión', async () => {
  setToken('token');
  fetchMock
    .mockResolvedValueOnce(jsonResponse(testUser))
    .mockRejectedValueOnce(new TypeError('offline'));
  const { client } = renderAuth(<Account />);
  await screen.findByText('authenticated');
  client.setQueryData(['private-data'], { secret: 'data' });
  localStorage.setItem('lean.shopping.v1', JSON.stringify({ userId: testUser.id, weeks: {} }));
  sessionStorage.setItem('lean.goalWizard.v1', 'draft');
  localStorage.setItem('lean.goalWizard.skipped', '1');
  fireEvent.click(screen.getByText('Salir'));
  await screen.findByText('anonymous');
  expect(sessionStorage.getItem('lean.goalWizard.v1')).toBeNull();
  expect(localStorage.getItem('lean.goalWizard.skipped')).toBeNull();
  expect(getToken()).toBeNull();
  expect(localStorage.getItem('lean.shopping.v1')).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost/api/auth/logout');
});

it('cerrar sesión resuelve y limpia el estado con revocación pendiente', async () => {
  setToken('original-token');
  fetchMock
    .mockResolvedValueOnce(jsonResponse(testUser))
    .mockReturnValueOnce(new Promise<Response>(() => {}));
  const onLogout = vi.fn();
  const { client } = renderAuth(<Account onLogout={onLogout} />);
  await screen.findByText('authenticated');
  client.setQueryData(['private-data'], 'secret');
  fireEvent.click(screen.getByText('Salir'));
  await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  expect(screen.getByText('anonymous')).toBeTruthy();
  expect(screen.queryByText(testUser.username)).toBeNull();
  expect(getToken()).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  const [url, init] = fetchMock.mock.calls[1]!;
  expect(url).toBe('http://localhost/api/auth/logout');
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer original-token');
});

it.each([0, 500])('logoutAll conserva la sesión y propaga el error %s', async (status) => {
  setToken('token');
  fetchMock.mockResolvedValueOnce(jsonResponse(testUser));
  if (status === 0) fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  else fetchMock.mockResolvedValueOnce(jsonResponse({}, status));
  const onError = vi.fn();
  const onLogout = vi.fn();
  const { client } = renderAuth(<Account onError={onError} onLogout={onLogout} />);
  await screen.findByText('authenticated');
  client.setQueryData(['private-data'], 'secret');
  fireEvent.click(screen.getByText('Salir de todos'));
  await waitFor(() => expect(onError).toHaveBeenCalledOnce());
  expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
  expect(onError.mock.calls[0]?.[0]).toMatchObject({ status });
  expect(onLogout).not.toHaveBeenCalled();
  expect(screen.getByText('authenticated')).toBeTruthy();
  expect(getToken()).toBe('token');
  expect(client.getQueryData(['private-data'])).toBe('secret');
});

it.each([204, 401])('logoutAll espera la respuesta %s y limpia la sesión', async (status) => {
  setToken('original-token');
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  fetchMock.mockResolvedValueOnce(jsonResponse(testUser)).mockReturnValueOnce(response);
  const onLogout = vi.fn();
  const onError = vi.fn();
  const { client } = renderAuth(<Account onLogout={onLogout} onError={onError} />);
  await screen.findByText('authenticated');
  client.setQueryData(['private-data'], 'secret');
  fireEvent.click(screen.getByText('Salir de todos'));
  expect(onLogout).not.toHaveBeenCalled();
  expect(screen.getByText('authenticated')).toBeTruthy();
  expect(getToken()).toBe('original-token');
  expect(client.getQueryData(['private-data'])).toBe('secret');
  const [url, init] = fetchMock.mock.calls[1]!;
  expect(url).toBe('http://localhost/api/auth/logout-all');
  expect(init?.method).toBe('POST');
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer original-token');
  await act(async () => {
    resolveResponse(new Response(null, { status }));
    await response;
  });
  await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  expect(onError).not.toHaveBeenCalled();
  expect(screen.getByText('anonymous')).toBeTruthy();
  expect(screen.queryByText(testUser.username)).toBeNull();
  expect(getToken()).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it.each([false, true])('cerrar sesión sin token omite la revocación (todos: %s)', async (all) => {
  const onLogout = vi.fn();
  renderAuth(<Account onLogout={onLogout} />);
  fireEvent.click(screen.getByText(all ? 'Salir de todos' : 'Salir'));
  await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  expect(screen.getByText('anonymous')).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  [false, 204],
  [false, 401],
  [true, 204],
  [true, 401],
])('un logout tardío conserva la nueva sesión (todos: %s, HTTP: %s)', async (all, status) => {
  setToken('original-token');
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  fetchMock
    .mockResolvedValueOnce(jsonResponse(testUser))
    .mockReturnValueOnce(response)
    .mockResolvedValueOnce(jsonResponse({ token: 'new-token', user: nextUser }));
  const { client } = renderAuth(<Account />);
  await screen.findByText('authenticated');
  fireEvent.click(screen.getByText(all ? 'Salir de todos' : 'Salir'));
  if (!all) await screen.findByText('anonymous');
  fireEvent.click(screen.getByText('Ingresar'));
  await screen.findByText(nextUser.username);
  client.setQueryData(['private-data'], 'new-secret');
  await act(async () => {
    resolveResponse(new Response(null, { status }));
    await response;
  });
  expect(screen.getByText('authenticated')).toBeTruthy();
  expect(screen.getByText(nextUser.username)).toBeTruthy();
  expect(getToken()).toBe('new-token');
  expect(client.getQueryData(['private-data'])).toBe('new-secret');
});

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

it('limpia el asistente cuando ingresa otra cuenta', async () => {
  setToken('old-token');
  fetchMock
    .mockResolvedValueOnce(jsonResponse(testUser))
    .mockResolvedValueOnce(jsonResponse({ token: 'new-token', user: nextUser }));
  renderAuth(<Account />);
  await screen.findByText(testUser.username);
  sessionStorage.setItem('lean.goalWizard.v1', 'draft');
  localStorage.setItem('lean.goalWizard.skipped', '1');
  fireEvent.click(screen.getByText('Ingresar'));
  await screen.findByText(nextUser.username);
  expect(sessionStorage.getItem('lean.goalWizard.v1')).toBeNull();
  expect(localStorage.getItem('lean.goalWizard.skipped')).toBeNull();
});
