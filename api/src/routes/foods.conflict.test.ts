import { barcodeTakenErrorSchema } from '@lean/shared';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb, type Db } from '../db/client';
import type { Food } from '../db/schema';
import type { AppEnv } from '../env';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { foods } from './foods';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('custom barcode conflicts without database', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const existing: Food = {
    id: '00000000-0000-4000-8000-000000000002',
    source: 'custom',
    ownerId: userId,
    name: 'Existente',
    barcode: '12345678',
    brand: null,
    kcalPer100g: 100,
    proteinPer100g: '10',
    carbsPer100g: '10',
    fatPer100g: '2',
    servingGrams: null,
    servingLabel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const current: Food = { ...existing, id: '00000000-0000-4000-8000-000000000003', barcode: null };
  const input = {
    name: 'Nuevo',
    barcode: existing.barcode,
    kcal: 100,
    protein: 10,
    carbs: 10,
    fat: 2,
  };

  it.each(['POST', 'PATCH'])(
    '%s retries the lookup once and returns the conflicting food',
    async (method) => {
      const original = new Error('unique violation', { cause: { code: '23505' } });
      const returning = vi.fn().mockRejectedValue(original);
      const limit = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([existing]);
      const selectWhere = vi.fn().mockReturnValue({ limit });
      if (method === 'PATCH') selectWhere.mockResolvedValueOnce([current]);
      vi.mocked(getDb).mockReturnValue({
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }),
        }),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: selectWhere }) }),
      } as unknown as Db);
      const app = new Hono<AppEnv>();
      app.use('*', async (c, next) => {
        c.set('userId', userId);
        await next();
      });
      app.onError(handleError);
      app.route('/foods', foods);
      const response = await app.request(
        method === 'POST' ? '/foods' : `/foods/${current.id}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
        testEnv,
      );
      expect(response.status).toBe(409);
      const body = barcodeTakenErrorSchema.parse(await response.json());
      expect(body).toMatchObject({
        error: { code: 'barcode_taken', message: 'Ese código ya está cargado' },
        food: { id: existing.id, createdByMe: true },
      });
      expect(returning).toHaveBeenCalledOnce();
      expect(limit).toHaveBeenCalledTimes(2);
    },
  );

  it('propagates the original error when both lookups find no food', async () => {
    const original = new Error('unique violation', { cause: { code: '23505' } });
    const limit = vi.fn().mockResolvedValue([]);
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(original) }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }),
      }),
    } as unknown as Db);
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('userId', userId);
      await next();
    });
    const onError = vi.fn(handleError);
    app.onError(onError);
    app.route('/foods', foods);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await app.request(
      '/foods',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      testEnv,
    );
    expect(response.status).toBe(500);
    expect(onError.mock.calls[0]?.[0]).toBe(original);
    expect(limit).toHaveBeenCalledTimes(2);
  });
});
