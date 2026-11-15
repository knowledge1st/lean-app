import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../env';
import { app } from '../index';
import { testEnv } from '../test-env';
import { AppError, handleError, handleNotFound } from './errors';

const makeApp = () => {
  const a = new Hono<AppEnv>();
  a.get('/app-error', () => {
    throw new AppError(409, 'conflict', 'Already exists');
  });
  a.get('/http-exception', () => {
    throw new HTTPException(401, { message: 'Nope' });
  });
  a.get('/boom', () => {
    throw new Error('secret connection string leaked');
  });
  a.notFound(handleNotFound);
  a.onError(handleError);
  return a;
};

afterEach(() => vi.restoreAllMocks());

describe('error handling', () => {
  it('returns 404 with the error format for unknown routes', async () => {
    const res = await app.request('/api/does-not-exist', {}, testEnv);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Route not found' },
    });
  });

  it('maps AppError to its status and code', async () => {
    const res = await makeApp().request('/app-error');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'Already exists' } });
  });

  it('maps HTTPException to the error format', async () => {
    const res = await makeApp().request('/http-exception');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Nope' } });
  });

  it('returns 500 without leaking internal details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await makeApp().request('/boom');
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
    expect(body).not.toContain('secret');
  });
});
