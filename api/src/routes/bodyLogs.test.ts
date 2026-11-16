import { bodyLogSchema } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { bodyLogs as table } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { bodyLogs } from './bodyLogs';

describe.skipIf(!hasTestDatabase)('body logs integration', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30000);
  afterEach(async () => {
    await f.cleanup();
  }, 30000);
  it('upserts one row, merges fields, serializes numbers and deletes', async () => {
    expect(
      (await f.request('/body-logs/2026-11-14', 'PUT', { weightKg: 80, waistCm: 90 })).status,
    ).toBe(200);
    const response = await f.request('/body-logs/2026-11-14', 'PUT', { bodyFatPct: 20 });
    expect(response.status).toBe(200);
    expect(bodyLogSchema.parse(await response.json())).toEqual({
      date: '2026-11-14',
      weightKg: 80,
      bodyFatPct: 20,
      waistCm: 90,
      hipCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
    });
    const rows = await f.db.select().from(table).where(eq(table.userId, f.accounts[0]!.user.id));
    expect(rows).toHaveLength(1);
    expect((await f.request('/body-logs/2026-11-14', 'DELETE')).status).toBe(204);
    const missing = await f.request('/body-logs/2026-11-14', 'DELETE');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'not_found', message: 'Registro no encontrado' },
    });
  });
  it('rounds trend weights to two decimals at floating-point ties', async () => {
    expect((await f.request('/body-logs/2026-11-14', 'PUT', { weightKg: 80 })).status).toBe(200);
    expect((await f.request('/body-logs/2026-11-15', 'PUT', { weightKg: 81.15 })).status).toBe(200);
    const response = await f.request('/body-logs?from=2026-11-14&to=2026-11-15');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      logs: [
        { date: '2026-11-14', weightKg: 80, trendWeightKg: 80 },
        { date: '2026-11-15', weightKg: 81.15, trendWeightKg: 80.12 },
      ],
    });
  });
  it('uses exactly 60 prior days, carries trend across null weights and filters the range', async () => {
    for (const [date, input] of [
      ['2026-09-01', { weightKg: 200 }], // 61 days before from: excluded
      ['2026-09-02', { weightKg: 80 }], // 60 days before from: included
      ['2026-10-31', { weightKg: 81 }],
      ['2026-11-01', { waistCm: 90 }],
      ['2026-11-02', { weightKg: 79 }],
      ['2026-11-03', { waistCm: 91 }],
      ['2026-11-04', { weightKg: 100 }],
    ] as const)
      expect((await f.request(`/body-logs/${date}`, 'PUT', input)).status).toBe(200);
    const response = await f.request('/body-logs?from=2026-11-01&to=2026-11-03');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      logs: [
        { date: '2026-11-01', weightKg: null, trendWeightKg: 80.1 },
        { date: '2026-11-02', weightKg: 79, trendWeightKg: 79.99 },
        { date: '2026-11-03', weightKg: null, trendWeightKg: 79.99 },
      ],
    });
    expect(
      await (
        await f.request('/body-logs?from=2026-09-01&to=2026-11-03', 'GET', undefined, 1)
      ).json(),
    ).toEqual({ logs: [] });
    expect((await f.request('/body-logs/2026-11-02', 'DELETE', undefined, 1)).status).toBe(404);
    await f.request('/body-logs/2026-11-02', 'PUT', { weightKg: 50 }, 1);
    expect(
      await (await f.request('/body-logs?from=2026-11-02&to=2026-11-02')).json(),
    ).toMatchObject({ logs: [{ weightKg: 79 }] });
  });
  it.each([
    ['weightKg', 25, 300],
    ['bodyFatPct', 3, 60],
    ...['waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm'].map((key) => [key, 20, 250]),
  ] as [string, number, number][])('accepts exact bounds for %s', async (key, min, max) => {
    for (const value of [min, max])
      expect((await f.request('/body-logs/2026-11-14', 'PUT', { [key]: value })).status).toBe(200);
  });
});

describe('body logs validation without database', () => {
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/body-logs', bodyLogs);
  validationApp.onError(handleError);
  it.each([
    {},
    { weightKg: null },
    { weightKg: 80, userId: 'abc' },
    ...[
      ['weightKg', 24.9, 300.1],
      ['bodyFatPct', 2.9, 60.1],
      ...['waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm'].map((key) => [key, 19.9, 250.1]),
    ].flatMap(([key, min, max]) => [{ [key!]: min }, { [key!]: max }]),
  ])('rejects body %j', async (body) => {
    const r = await validationApp.request(
      '/api/body-logs/2026-11-14',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      testEnv,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it.each([
    '?from=2026-01-01&to=2027-01-02',
    '?from=2026-11-02&to=2026-11-01',
    '?from=2026-11-01',
    '',
  ])('rejects range %s', async (query) => {
    expect((await validationApp.request(`/api/body-logs${query}`, {}, testEnv)).status).toBe(400);
  });
  it('requires authentication', async () => {
    expect(
      (await app.request('/api/body-logs?from=2026-11-01&to=2026-11-01', {}, testEnv)).status,
    ).toBe(401);
  });
});
