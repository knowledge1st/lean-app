import type { Entry } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { foods, mealEntries } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { entries } from './entries';

describe.skipIf(!hasTestDatabase)('entries integration', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30_000);
  afterEach(async () => {
    await f.cleanup();
  }, 30_000);
  it('creates snapshots, scales stored values despite food edits, and deletes entries', async () => {
    const food = await f.food();
    const entry = await f.entry(food.id!);
    expect(entry).toMatchObject({
      kcal: 300,
      protein: 15.4,
      grams: 150,
      status: 'eaten',
      food: { id: food.id },
    });
    let [row] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, entry.id));
    expect(Number(row!.kcal)).toBe(300);
    expect(Number(row!.protein)).toBe(15.375);
    expect((await f.request(`/foods/${food.id}`, 'PATCH', { kcal: 900, protein: 1 })).status).toBe(
      200,
    );
    expect(
      ((await (await f.request('/entries?from=2026-11-14&to=2026-11-14')).json()) as Entry[])[0]
        ?.kcal,
    ).toBe(300);
    const response = await f.request(`/entries/${entry.id}`, 'PATCH', {
      grams: 250,
      meal: 'dinner',
      date: '2026-11-15',
      status: 'planned',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kcal: 500,
      protein: 25.6,
      grams: 250,
      meal: 'dinner',
      date: '2026-11-15',
      status: 'planned',
    });
    [row] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, entry.id));
    expect(Number(row!.protein)).toBe(25.625);
    expect((await f.request(`/entries/${entry.id}`, 'DELETE')).status).toBe(204);
    expect((await f.request(`/entries/${entry.id}`, 'DELETE')).status).toBe(404);
  });
  it('rejects grams below storage precision with 400', async () => {
    const food = await f.food();
    const response = await f.request('/entries', 'POST', {
      foodId: food.id,
      date: '2026-11-14',
      meal: 'lunch',
      grams: 1e-10,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it('keeps four decimal places in storage and rounds only the response', async () => {
    const food = await f.food();
    const entry = await f.entry(food.id!, { grams: 33.3 });
    expect(entry).toMatchObject({ kcal: 67, protein: 3.4, carbs: 6.8, fat: 1 });
    const [row] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, entry.id));
    expect(row).toMatchObject({
      kcal: '66.6000',
      protein: '3.4133',
      carbs: '6.8265',
      fat: '1.0490',
    });
  });
  it('serializes simultaneous portion updates against the current stored row', async () => {
    const food = await f.food();
    const entry = await f.entry(food.id!, { grams: 100 });
    const responses = await Promise.all(
      [150, 250].map((grams) => f.request(`/entries/${entry.id}`, 'PATCH', { grams })),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const [row] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, entry.id));
    expect([150, 250]).toContain(Number(row!.grams));
    expect(Number(row!.kcal)).toBe(Number(row!.grams) * 2);
    expect(Number(row!.protein)).toBeCloseTo(Number(row!.grams) * 0.1025, 4);
  });
  it('isolates entries between users and accepts shared custom foods and seeds', async () => {
    const food = await f.food();
    const entry = await f.entry(food.id!);
    expect(
      await (await f.request('/entries?from=2026-11-01&to=2026-12-01', 'GET', undefined, 1)).json(),
    ).toEqual([]);
    for (const method of ['PATCH', 'DELETE'])
      expect(
        (
          await f.request(
            `/entries/${entry.id}`,
            method,
            method === 'PATCH' ? { grams: 500 } : undefined,
            1,
          )
        ).status,
      ).toBe(404);
    const [row] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, entry.id));
    expect(Number(row!.grams)).toBe(150);
    for (const foodId of [crypto.randomUUID()]) {
      const response = await f.request(
        '/entries',
        'POST',
        { foodId, date: '2026-11-14', meal: 'lunch', grams: 100 },
        1,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: 'not_found', message: 'Alimento no encontrado' },
      });
    }
    const shared = await f.entry(food.id!, {}, 1);
    expect(shared.foodId).toBe(food.id);
    expect((await f.request(`/entries/${shared.id}`, 'PATCH', { grams: 200 }, 1)).status).toBe(200);
    const [seed] = await f.db.select().from(foods).where(eq(foods.source, 'seed')).limit(1);
    expect(seed).toBeDefined();
    await f.entry(seed!.id, {}, 1);
    for (const method of ['PATCH', 'DELETE'])
      expect(
        (
          await f.request(
            `/entries/${crypto.randomUUID()}`,
            method,
            method === 'PATCH' ? { grams: 100 } : undefined,
          )
        ).status,
      ).toBe(404);
  });
  it('orders inclusive ranges by date, enum meal, createdAt and id', async () => {
    const food = await f.food();
    const specs = [
      { date: '2026-12-01', meal: 'breakfast' },
      { date: '2026-11-01', meal: 'dinner' },
      { date: '2026-11-01', meal: 'afternoon_snack' },
      { date: '2026-11-01', meal: 'lunch' },
      { date: '2026-11-01', meal: 'lunch' },
      { date: '2026-10-31', meal: 'breakfast' },
    ];
    const created = [];
    for (const spec of specs) created.push(await f.entry(food.id!, spec));
    const tied = created.slice(3, 5).sort((a, b) => a.id.localeCompare(b.id));
    for (const item of tied)
      await f.db
        .update(mealEntries)
        .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(mealEntries.id, item.id));
    const response = await f.request('/entries?from=2026-11-01&to=2026-12-01');
    expect(response.status).toBe(200);
    const result = (await response.json()) as Entry[];
    expect(result.map((e) => e.id)).toEqual([
      ...tied.map((e) => e.id),
      created[2]!.id,
      created[1]!.id,
      created[0]!.id,
    ]);
  });
});

describe('entries without database', () => {
  // Exercise real validators with a known user, without invoking database authentication.
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/entries', entries);
  validationApp.onError(handleError);
  it.each([
    ['GET', '?from=2026-11-01&to=2026-12-02', undefined],
    ['GET', '?from=2026-02-30&to=2026-03-01', undefined],
    ['POST', '', { date: '2026-11-14', meal: 'lunch', foodId: crypto.randomUUID(), grams: 0 }],
    ['POST', '', { date: '2026-11-14', meal: 'lunch', foodId: crypto.randomUUID(), grams: 5001 }],
    ['POST', '', { date: '2026-11-14', meal: 'lunch', foodId: crypto.randomUUID(), grams: 1e-10 }],
    ['POST', '', { date: '0000-01-01', meal: 'lunch', foodId: crypto.randomUUID(), grams: 100 }],
    ['PATCH', `/${crypto.randomUUID()}`, {}],
    ['PATCH', '/abc', { grams: 100 }],
  ])('validates %s %s', async (method, path, body) => {
    const response = await validationApp.request(
      `/api/entries${path}`,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      testEnv,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it.each([
    ['GET', ''],
    ['POST', ''],
    ['PATCH', '/abc'],
    ['DELETE', '/abc'],
  ])('requires a token for %s', async (method, path) => {
    expect((await app.request(`/api/entries${path}`, { method }, testEnv)).status).toBe(401);
  });
});
