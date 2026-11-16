import { exerciseLogSchema } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { exerciseLogs } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { exercise } from './exercise';

const input = { date: '2026-11-14', activity: '  Caminar  ', minutes: 30 };
describe.skipIf(!hasTestDatabase)('exercise integration', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30000);
  afterEach(async () => {
    await f.cleanup();
  }, 30000);
  it('creates with zero kcal, lists, merges updates and deletes', async () => {
    const created = await f.request('/exercise', 'POST', input);
    expect(created.status).toBe(201);
    const row = exerciseLogSchema.parse(await created.json());
    expect(row).toMatchObject({ activity: 'Caminar', kcal: 0, minutes: 30 });
    expect(await (await f.request('/exercise?from=2026-11-14&to=2026-11-14')).json()).toEqual({
      logs: [row],
    });
    const patched = await f.request(`/exercise/${row.id}`, 'PATCH', { kcal: 250 });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({ ...row, kcal: 250 });
    expect((await f.request(`/exercise/${row.id}`, 'DELETE')).status).toBe(204);
    expect((await f.request(`/exercise/${row.id}`, 'DELETE')).status).toBe(404);
    expect((await f.request(`/exercise/${row.id}`, 'PATCH', { minutes: 10 })).status).toBe(404);
  });
  it('orders by date, createdAt and id with inclusive range boundaries', async () => {
    const rows = [];
    for (const date of ['2026-11-15', '2026-11-14', '2026-11-14', '2026-11-13']) {
      rows.push(
        exerciseLogSchema.parse(
          await (await f.request('/exercise', 'POST', { ...input, date })).json(),
        ),
      );
    }
    for (const row of rows.slice(1, 3))
      await f.db
        .update(exerciseLogs)
        .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(exerciseLogs.id, row.id));
    const tied = rows.slice(1, 3).sort((a, b) => a.id.localeCompare(b.id));
    expect(await (await f.request('/exercise?from=2026-11-14&to=2026-11-15')).json()).toEqual({
      logs: [...tied, rows[0]],
    });
  });
  it('isolates reads, edits and deletes by user', async () => {
    const row = exerciseLogSchema.parse(await (await f.request('/exercise', 'POST', input)).json());
    expect(
      await (
        await f.request('/exercise?from=2026-11-14&to=2026-11-14', 'GET', undefined, 1)
      ).json(),
    ).toEqual({ logs: [] });
    for (const id of [row.id, crypto.randomUUID()])
      for (const method of ['PATCH', 'DELETE']) {
        const response = await f.request(
          `/exercise/${id}`,
          method,
          method === 'PATCH' ? { minutes: 10 } : undefined,
          1,
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({
          error: { code: 'not_found', message: 'Ejercicio no encontrado' },
        });
      }
    expect(await (await f.request('/exercise?from=2026-11-14&to=2026-11-14')).json()).toEqual({
      logs: [row],
    });
  });
});
describe('exercise validation without database', () => {
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/exercise', exercise);
  validationApp.onError(handleError);
  it.each([
    { minutes: 0 },
    { minutes: 601 },
    { kcal: -1 },
    { kcal: 3001 },
    { activity: ' ' },
    { userId: 'abc' },
  ])('rejects %j', async (patch) => {
    const response = await validationApp.request(
      '/api/exercise',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, ...patch }),
      },
      testEnv,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it.each([
    ['PATCH', '/abc', { minutes: 10 }],
    ['DELETE', '/abc', undefined],
    ['PATCH', `/${crypto.randomUUID()}`, {}],
    ['GET', '?from=2026-01-01&to=2027-01-02', undefined],
    ['GET', '?from=2026-11-02&to=2026-11-01', undefined],
    ['GET', '', undefined],
  ])('validates %s %s', async (method, path, body) => {
    const response = await validationApp.request(
      `/api/exercise${path}`,
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
  it.each(['GET', 'POST', 'PATCH', 'DELETE'])('requires auth for %s', async (method) => {
    expect(
      (
        await app.request(
          `/api/exercise${method === 'PATCH' || method === 'DELETE' ? '/abc' : ''}`,
          { method },
          testEnv,
        )
      ).status,
    ).toBe(401);
  });
});
