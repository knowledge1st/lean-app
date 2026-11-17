import { describe, expect, it } from 'vitest';
import { app } from '../index';
import { ALLOWED, testEnv } from '../test-env';
import { MAX_BODY_BYTES } from './security';

const expectSecurityHeaders = (res: Response) => {
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
};

describe('security headers', () => {
  it('are sent on successful, unauthorized, not-found and preflight responses', async () => {
    const responses = [
      await app.request('/api/health', {}, testEnv),
      await app.request('/api/me', {}, testEnv),
      await app.request('/api/does-not-exist', {}, testEnv),
      await app.request(
        '/api/entries',
        {
          method: 'OPTIONS',
          headers: { Origin: ALLOWED, 'Access-Control-Request-Method': 'POST' },
        },
        testEnv,
      ),
    ];
    expect(responses.map((res) => res.status)).toEqual([200, 401, 401, 204]);
    responses.forEach(expectSecurityHeaders);
  });
});

describe('body limit', () => {
  const login = (body: string) =>
    app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      testEnv,
    );

  it('rejects oversized bodies before authentication or parsing', async () => {
    for (const path of ['/api/auth/login', '/api/entries']) {
      const res = await app.request(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ padding: 'x'.repeat(MAX_BODY_BYTES) }),
        },
        testEnv,
      );
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({
        error: {
          code: 'payload_too_large',
          message: 'El cuerpo del pedido es demasiado grande',
        },
      });
      expectSecurityHeaders(res);
    }
  });

  it('lets bodies under the limit reach validation', async () => {
    const res = await login(JSON.stringify({ username: '', password: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
});
