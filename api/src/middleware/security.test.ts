import { PHOTO_LOG_MAX_DATA_URL, parseMealPhotoSchema } from '@lean/shared';
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

  it.each([true, false])('rejects oversized bodies (Content-Length: %s)', async (withLength) => {
    const body = JSON.stringify({ padding: 'x'.repeat(MAX_BODY_BYTES) });
    for (const [method, path] of [
      ['POST', '/api/auth/login'],
      ['POST', '/api/entries'],
      ['PUT', '/api/entries/parse-photo'],
      ['POST', '/api/entries/parse-photo/other'],
    ] as const) {
      const res = await app.request(
        path,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(withLength
              ? { 'Content-Length': String(new TextEncoder().encode(body).length) }
              : {}),
          },
          body,
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

  it.each([true, false])(
    'allows a valid 100 KB photo body (Content-Length: %s)',
    async (withLength) => {
      const input = {
        image: `data:image/jpeg;base64,${'AAAA'.repeat(25_000)}`,
        date: '2026-11-19',
        defaultMeal: 'lunch',
      };
      expect(parseMealPhotoSchema.safeParse(input).success).toBe(true);
      const body = JSON.stringify(input);
      const res = await app.request(
        '/api/entries/parse-photo',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(withLength
              ? { 'Content-Length': String(new TextEncoder().encode(body).length) }
              : {}),
          },
          body,
        },
        testEnv,
      );
      // Passing the body limit reaches authentication without needing a database.
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
      expectSecurityHeaders(res);
    },
  );

  it.each([true, false])(
    'rejects oversized photo bodies (Content-Length: %s)',
    async (withLength) => {
      const body = JSON.stringify({ image: 'x'.repeat(PHOTO_LOG_MAX_DATA_URL + 2000) });
      const res = await app.request(
        '/api/entries/parse-photo',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(withLength
              ? { 'Content-Length': String(new TextEncoder().encode(body).length) }
              : {}),
          },
          body,
        },
        testEnv,
      );
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({
        error: { code: 'photo_too_large', message: 'La foto es demasiado grande.' },
      });
      expectSecurityHeaders(res);
    },
  );

  it('lets bodies under the limit reach validation', async () => {
    const res = await login(JSON.stringify({ username: '', password: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
});
