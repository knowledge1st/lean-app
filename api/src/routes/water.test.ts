import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { waterLogs } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { water } from './water';

const date = '2026-11-14';
describe.skipIf(!hasTestDatabase)('water integration', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30000);
  afterEach(async () => {
    await f.cleanup();
  }, 30000);
  it('adds, clamps to zero and rejects the upper limit without changing rows', async () => {
    expect(await (await f.request(`/water?date=${date}`)).json()).toEqual({ date, ml: 0 });
    for (let i = 1; i <= 4; i++) {
      const r = await f.request('/water', 'POST', { date, ml: 250 });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ date, ml: i * 250 });
    }
    const before = await f.db
      .select()
      .from(waterLogs)
      .where(eq(waterLogs.userId, f.accounts[0]!.user.id));
    const exceeded = await f.request('/water', 'POST', { date, ml: 10000 });
    expect(exceeded.status).toBe(400);
    expect(await exceeded.json()).toEqual({
      error: { code: 'water_limit', message: 'El agua del día no puede superar 10.000 ml' },
    });
    expect(
      await f.db.select().from(waterLogs).where(eq(waterLogs.userId, f.accounts[0]!.user.id)),
    ).toEqual(before);
    expect(await (await f.request('/water', 'POST', { date, ml: -2000 })).json()).toEqual({
      date,
      ml: 0,
    });
    expect(await (await f.request('/water', 'POST', { date, ml: 10000 })).json()).toEqual({
      date,
      ml: 10000,
    });
  });
  it('serializes simultaneous additions and consolidates legacy duplicates', async () => {
    await f.db
      .insert(waterLogs)
      .values([100, 200].map((ml) => ({ userId: f.accounts[0]!.user.id, date, ml })));
    expect(await (await f.request(`/water?date=${date}`)).json()).toEqual({ date, ml: 300 });
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => f.request('/water', 'POST', { date, ml: 250 })),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(await (await f.request(`/water?date=${date}`)).json()).toEqual({ date, ml: 2300 });
    const rows = await f.db
      .select()
      .from(waterLogs)
      .where(eq(waterLogs.userId, f.accounts[0]!.user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ml).toBe(2300);
  });
  it('isolates users and dates', async () => {
    await f.request('/water', 'POST', { date, ml: 500 });
    expect(await (await f.request(`/water?date=${date}`, 'GET', undefined, 1)).json()).toEqual({
      date,
      ml: 0,
    });
    await f.request('/water', 'POST', { date, ml: 100 }, 1);
    expect(await (await f.request(`/water?date=${date}`)).json()).toEqual({ date, ml: 500 });
    expect(await (await f.request('/water?date=2026-11-15')).json()).toEqual({
      date: '2026-11-15',
      ml: 0,
    });
  });
});
describe('water validation without database', () => {
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/water', water);
  validationApp.onError(handleError);
  it.each([0, -10001, 10001, 0.5, null])('rejects ml %s', async (ml) => {
    const response = await validationApp.request(
      '/api/water',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ml }),
      },
      testEnv,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it('validates date and requires authentication', async () => {
    expect((await validationApp.request('/api/water?date=2026-02-30', {}, testEnv)).status).toBe(
      400,
    );
    expect((await app.request(`/api/water?date=${date}`, {}, testEnv)).status).toBe(401);
    expect((await app.request('/api/water', { method: 'POST' }, testEnv)).status).toBe(401);
  });
});
