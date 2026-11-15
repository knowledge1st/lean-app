import { clearToken, getToken } from './session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

type RequestOptions = Omit<ApiOptions, 'method' | 'body'>;

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function isApiErrorBody(value: unknown): value is { error: { code: string; message: string } } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export function createApiClient({ baseUrl }: { baseUrl?: string }) {
  async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    if (!baseUrl?.trim()) {
      throw new Error('Falta configurar VITE_API_URL para realizar solicitudes a la API.');
    }

    const headers = new Headers(options.headers);
    // Authentication belongs exclusively to the session module.
    headers.delete('Authorization');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`, {
        method: options.method ?? 'GET',
        headers,
        ...(body !== undefined ? { body } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      // Preserve cancellation so Query can distinguish it from a network failure.
      if (options.signal?.aborted) throw error;
      throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor.');
    }

    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      const detail = isApiErrorBody(payload)
        ? payload.error
        : { code: 'http_error', message: 'No se pudo completar la solicitud.' };
      if (response.status === 401 && detail.code !== 'invalid_credentials') {
        clearToken();
        if (unauthorizedListeners.size) {
          unauthorizedListeners.forEach((listener) => listener());
        } else if (typeof window !== 'undefined' && window.location.hash !== '#/login') {
          window.location.hash = '#/login';
        }
      }
      throw new ApiError(response.status, detail.code, detail.message);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  return {
    apiFetch: request,
    get: <T>(path: string, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PATCH', body }),
    delete: <T>(path: string, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'DELETE' }),
  };
}

export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? '' });
export const apiFetch = api.apiFetch;
