import { describe, expect, it } from 'vitest';
import { app } from '../index';
import { testEnv } from '../test-env';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await app.request('/api/health', {}, testEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
