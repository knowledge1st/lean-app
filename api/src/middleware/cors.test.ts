import { describe, expect, it } from 'vitest';
import { app } from '../index';
import { ALLOWED, testEnv } from '../test-env';

describe('cors', () => {
  it('sends CORS headers to the allowed origin', async () => {
    const res = await app.request('/api/health', { headers: { Origin: ALLOWED } }, testEnv);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
  });

  it('sends no CORS headers to other origins', async () => {
    const res = await app.request(
      '/api/health',
      { headers: { Origin: 'https://evil.example' } },
      testEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers preflight with 204 and allows Authorization', async () => {
    const res = await app.request(
      '/api/health',
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
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('gives no CORS headers on preflight from other origins', async () => {
    const res = await app.request(
      '/api/health',
      {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
      },
      testEnv,
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('keeps CORS headers on error responses', async () => {
    const res = await app.request('/api/nope', { headers: { Origin: ALLOWED } }, testEnv);
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
  });
});
