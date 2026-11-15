import { daySummarySchema, MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { summary } from './summary';

describe.skipIf(!hasTestDatabase)('summary integration', () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30_000);
  afterEach(async () => {
    await f.cleanup();
  }, 30_000);
  it('sums stored values before rounding, separates statuses and includes five meals', async () => {
    const food = await f.food();
    for (let i = 0; i < 3; i++)
      await f.entry(food.id!, { grams: 33.3, meal: i === 2 ? 'dinner' : 'breakfast' });
    await f.entry(food.id!, { grams: 100, meal: 'lunch', status: 'planned' });
    await f.entry(food.id!, { date: '2026-11-15' });
    const response = await f.request('/summary/day?date=2026-11-14');
    expect(response.status).toBe(200);
    const result = daySummarySchema.parse(await response.json());
    expect(result).toMatchObject({
      date: '2026-11-14',
      target: null,
      eaten: { kcal: 200, protein: 10.2, carbs: 20.5, fat: 3.1 },
      planned: { kcal: 200, protein: 10.3, carbs: 20.5, fat: 3.2 },
    });
    expect(result.meals.map((m) => m.meal)).toEqual(MEALS);
    expect(result.meals[0]).toMatchObject({
      eaten: { kcal: 133, protein: 6.8, carbs: 13.7, fat: 2.1 },
      planned: ZERO_MACROS,
    });
    expect(result.meals[1]).toMatchObject({ eaten: ZERO_MACROS, planned: result.planned });
    expect(result.meals[2]).toMatchObject({
      entries: [],
      eaten: ZERO_MACROS,
      planned: ZERO_MACROS,
    });
    expect(result.meals[4]).toMatchObject({
      entries: [],
      eaten: ZERO_MACROS,
      planned: ZERO_MACROS,
    });
    const listed = (await (
      await f.request('/entries?from=2026-11-14&to=2026-11-14')
    ).json()) as Entry[];
    expect(result.meals.flatMap((m) => m.entries)).toEqual(listed);
    const roundedKcalSum = listed
      .filter((e) => e.status === 'eaten')
      .reduce((sum, e) => sum + e.kcal, 0);
    expect(roundedKcalSum).toBe(201);
    expect(result.eaten.kcal).toBe(200);
  });
  it('returns empty days and excludes another user entries', async () => {
    const food = await f.food();
    await f.entry(food.id!);
    for (const [date, user] of [
      ['2026-11-14', 1],
      ['2026-11-15', 0],
    ] as const) {
      const response = await f.request(`/summary/day?date=${date}`, 'GET', undefined, user);
      expect(response.status).toBe(200);
      const result = (await response.json()) as DaySummary;
      expect(result).toEqual({
        date,
        eaten: ZERO_MACROS,
        planned: ZERO_MACROS,
        target: null,
        meals: MEALS.map((meal) => ({
          meal,
          eaten: ZERO_MACROS,
          planned: ZERO_MACROS,
          entries: [],
        })),
      });
    }
  });
});

describe('summary without database', () => {
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/summary', summary);
  validationApp.onError(handleError);
  it.each(['?date=2026-02-30', '?date=2026-13-01', ''])(
    'rejects invalid date %s',
    async (query) => {
      const response = await validationApp.request(`/api/summary/day${query}`, {}, testEnv);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    },
  );
  it('requires a token', async () => {
    expect((await app.request('/api/summary/day?date=2026-11-14', {}, testEnv)).status).toBe(401);
  });
});
