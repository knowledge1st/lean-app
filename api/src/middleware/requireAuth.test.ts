import { describe, expect, it } from 'vitest';
import { app } from '../index';
import { ALLOWED, testEnv } from '../test-env';

const unauthorized = { error: { code: 'unauthorized', message: 'Sesión inválida o vencida' } };
describe('auth boundary without database', () => {
  it('rejects missing and malformed headers before accessing the fake database', async () => {
    for (const path of ['/api/me', '/api/auth/logout', '/api/future', '/api/health-private']) {
      for (const header of [undefined, 'Basic abc', 'Bearer', 'Bearer a b']) {
        const response = await app.request(
          path,
          {
            method: path === '/api/auth/logout' ? 'POST' : 'GET',
            headers: header === undefined ? {} : { Authorization: header },
          },
          testEnv,
        );
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual(unauthorized);
      }
    }
  });
  it('protects login when the method is not POST', async () => {
    expect((await app.request('/api/auth/login', {}, testEnv)).status).toBe(401);
  });
  it('keeps health public and handles protected-route preflight', async () => {
    expect((await app.request('/api/health', {}, testEnv)).status).toBe(200);
    const response = await app.request(
      '/api/auth/logout',
      {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization',
        },
      },
      testEnv,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
  });
});
