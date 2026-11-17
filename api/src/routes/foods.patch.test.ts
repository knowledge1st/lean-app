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

describe('PATCH /foods/:id with stale reads', () => {
  const original: Food = {
    id: '00000000-0000-4000-8000-000000000001',
    ownerId: '00000000-0000-4000-8000-000000000002',
    source: 'custom',
    name: 'Original',
    brand: 'Marca original',
    barcode: '12345678',
    kcalPer100g: 100,
    proteinPer100g: '10',
    carbsPer100g: '10',
    fatPer100g: '2',
    servingGrams: '125.5',
    servingLabel: 'Una porción',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it.each([
    { patch: { brand: '  Nueva marca  ' }, columns: { brand: 'Nueva marca' } },
    { patch: { brand: null }, columns: { brand: null } },
    { patch: { barcode: null }, columns: { barcode: null } },
    { patch: { barcode: '87654321' }, columns: { barcode: '87654321' } },
    {
      patch: { kcal: 234, protein: 12.34, carbs: 23.45, fat: 4.56 },
      columns: {
        kcalPer100g: 234,
        proteinPer100g: '12.34',
        carbsPer100g: '23.45',
        fatPer100g: '4.56',
      },
    },
    {
      patch: { servingG: 50.5, servingLabel: '  Media porción  ' },
      columns: { servingGrams: '50.5', servingLabel: 'Media porción' },
    },
    {
      patch: { servingG: null, servingLabel: null },
      columns: { servingGrams: null, servingLabel: null },
    },
  ])('preserves another user’s name change when applying $patch', async ({ patch, columns }) => {
    let stored = { ...original };
    const set = vi.fn((changes: Partial<Food>) => ({
      where: vi.fn().mockReturnValue({
        returning: async () => {
          stored = {
            ...stored,
            ...Object.fromEntries(
              Object.entries(changes).filter(([, value]) => value !== undefined),
            ),
          };
          return [stored];
        },
      }),
    }));
    vi.mocked(getDb).mockReturnValue({
      // Both PATCH requests read the same snapshot before either user's changes.
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([original]) }),
      }),
      update: vi.fn().mockReturnValue({ set }),
    } as unknown as Db);
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('userId', c.req.header('X-Test-User')!);
      await next();
    });
    app.onError(handleError);
    app.route('/foods', foods);
    const request = (userId: string, body: unknown) =>
      app.request(
        `/foods/${original.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Test-User': userId },
          body: JSON.stringify(body),
        },
        testEnv,
      );

    expect((await request(original.ownerId!, { name: '  Nombre nuevo  ' })).status).toBe(200);
    expect((await request('00000000-0000-4000-8000-000000000003', patch)).status).toBe(200);
    expect(stored).toEqual({
      ...original,
      name: 'Nombre nuevo',
      ...columns,
      updatedAt: expect.any(Date),
    });
    expect(
      Object.fromEntries(
        Object.entries(set.mock.calls[1]![0]).filter(([, value]) => value !== undefined),
      ),
    ).toEqual({ ...columns, updatedAt: expect.any(Date) });
  });
});
