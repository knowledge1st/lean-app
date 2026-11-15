import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, onUnauthorized } from './api';
import { clearToken, getToken, setToken } from './session';

const client = createApiClient({ baseUrl: 'http://localhost:8787/' });
const fetchMock = vi.fn<typeof fetch>();
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', { location: { hash: '#/hoy' } });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it.each([true, false])('agrega Authorization solo con token (token: %s)', async (hasToken) => {
    if (hasToken) setToken('session-token');
    fetchMock.mockResolvedValue(new Response('{}'));
    await client.get('/me');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:8787/me');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      hasToken ? 'Bearer session-token' : null,
    );
  });

  it('conserva status, code y message del error de la API', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'validation_error', message: 'Datos inválidos' } }),
        { status: 422 },
      ),
    );
    const request = client.post('/me', {});
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Datos inválidos',
    });
  });

  it('borra lean.session y redirige al login ante 401', async () => {
    setToken('expired-token');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Sesión vencida' } }), {
        status: 401,
      }),
    );
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(localStorage.getItem('lean.session')).toBeNull();
    expect(window.location.hash).toBe('#/login');
  });

  it('notifica a los listeners sin cambiar el hash y permite desuscribirse', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    setToken('expired-token');
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    try {
      await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
      expect(getToken()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe('#/hoy');
    } finally {
      unsubscribe();
    }
    setToken('expired-token');
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/login');
  });

  it.each([false, true])(
    'un 401 tardío conserva la sesión nueva (token explícito: %s)',
    async (explicitToken) => {
      setToken('token-a');
      const listener = vi.fn();
      const unsubscribe = onUnauthorized(listener);
      let resolveResponse!: (response: Response) => void;
      const response = new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });
      fetchMock.mockReturnValueOnce(response);
      try {
        const request = client.get('/me', explicitToken ? { token: 'token-a' } : undefined);
        setToken('token-b');
        resolveResponse(new Response('{}', { status: 401 }));
        await expect(request).rejects.toBeInstanceOf(ApiError);
        expect(getToken()).toBe('token-b');
        expect(listener).not.toHaveBeenCalled();
        expect(window.location.hash).toBe('#/hoy');
      } finally {
        unsubscribe();
      }
    },
  );

  it('un 401 sin token enviado conserva la sesión y no notifica', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    fetchMock.mockReturnValueOnce(response);
    try {
      const request = client.get('/me');
      setToken('new-token');
      resolveResponse(new Response('{}', { status: 401 }));
      await expect(request).rejects.toMatchObject({ status: 401 });
      expect(getToken()).toBe('new-token');
      expect(listener).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('#/hoy');
    } finally {
      unsubscribe();
    }
  });

  it.each([undefined, 'explicit-token', ''])(
    'ignora Authorization en headers y usa el token indicado (%s)',
    async (token) => {
      setToken('session-token');
      fetchMock.mockResolvedValueOnce(new Response('{}'));
      await client.get('/me', {
        ...(token === undefined ? {} : { token }),
        headers: { Authorization: 'Bearer header-token' },
      });
      const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
      expect(headers.get('Authorization')).toBe(
        token === '' ? null : `Bearer ${token ?? 'session-token'}`,
      );
    },
  );

  it('invalid_credentials conserva token, hash y no notifica', async () => {
    setToken('valid-token');
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'invalid_credentials', message: 'Usuario o contraseña incorrectos' },
        }),
        { status: 401 },
      ),
    );
    try {
      await expect(client.post('/api/auth/password', {})).rejects.toMatchObject({
        status: 401,
        code: 'invalid_credentials',
      });
      expect(getToken()).toBe('valid-token');
      expect(window.location.hash).toBe('#/hoy');
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it.each(['not json', '{}', '{"error":{"code":12,"message":"No"}}'])(
    'usa un error genérico para cuerpos inválidos: %s',
    async (body) => {
      fetchMock.mockResolvedValue(new Response(body, { status: 503 }));
      await expect(client.get('/me')).rejects.toMatchObject({
        status: 503,
        code: 'http_error',
        message: 'No se pudo completar la solicitud.',
      });
    },
  );

  it('traduce fallas de red', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.get('/me')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('serializa JSON y conserva headers y signal', async () => {
    const signal = new AbortController().signal;
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      client.patch('/me', { weight: 70 }, { headers: { 'X-Request-Id': '123' }, signal }),
    ).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[0]![1];
    expect(init).toMatchObject({ method: 'PATCH', body: '{"weight":70}', signal });
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(init?.headers).get('X-Request-Id')).toBe('123');
  });

  it('informa si falta la URL sin hacer fetch', async () => {
    await expect(createApiClient({}).get('/me')).rejects.toThrow('VITE_API_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('session', () => {
  it('guarda, lee y borra el token bajo lean.session', () => {
    expect(getToken()).toBeNull();
    setToken('token');
    expect(localStorage.getItem('lean.session')).toBe('token');
    expect(getToken()).toBe('token');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('tolera localStorage inaccesible', () => {
    const unavailable = () => {
      throw new Error('Storage blocked');
    };
    vi.stubGlobal('localStorage', {
      getItem: unavailable,
      setItem: unavailable,
      removeItem: unavailable,
    });
    expect(getToken()).toBeNull();
    expect(() => setToken('token')).not.toThrow();
    expect(() => clearToken()).not.toThrow();
  });
});
