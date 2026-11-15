import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { getDb, type Db } from '../db/client';
import type { AppEnv } from '../env';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { foods } from './foods';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));

describe('DELETE /foods/:id', () => {
  it.each(['23001', '23503'])('returns food_in_use for SQLSTATE %s', async (code) => {
    const returning = vi.fn().mockRejectedValue(new Error('Query failed', { cause: { code } }));
    vi.mocked(getDb).mockReturnValue({
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }),
    } as unknown as Db);
    const app = new Hono<AppEnv>();
    app.onError(handleError);
    app.use('*', async (c, next) => {
      c.set('userId', '00000000-0000-4000-8000-000000000001');
      await next();
    });
    app.route('/foods', foods);

    const response = await app.request(
      '/foods/00000000-0000-4000-8000-000000000002',
      { method: 'DELETE' },
      testEnv,
    );

    expect(returning).toHaveBeenCalledOnce();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'food_in_use' } });
  });
});
