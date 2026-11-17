import { checkinSchema, checkinsResponseSchema, targetSchema } from '@lean/shared';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkinsFixture } from '../../test/helpers/checkins';
import { hasTestDatabase } from '../../test/helpers/db';
import { checkins as table, targets } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { checkins } from './checkins';

describe.skipIf(!hasTestDatabase)('checkins integration', { timeout: 30_000 }, () => {
  let f: ReturnType<typeof checkinsFixture>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    f = checkinsFixture();
    await f.setup();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await f.cleanup();
  });
  const targetCount = async (goalId: string) =>
    (await f.db.select().from(targets).where(eq(targets.goalId, goalId))).length;
  async function adjustment() {
    const saved = await f.started();
    await f.data(saved.goal.id);
    const checkin = (await f.pending())!;
    expect(checkin.status).toBe('adjust');
    return { saved, checkin };
  }
  it('returns null without an active goal or for a goal started after the evaluated week', async () => {
    expect(await f.pending()).toBeNull();
    await f.create();
    expect(await f.pending()).toBeNull();
  });
  it('persists insufficient data and reuses the saved checkin', async () => {
    await f.started('manual');
    const first = (await f.pending())!;
    expect(first).toMatchObject({
      status: 'insufficient_data',
      loggedDays: 0,
      weighIns: 0,
      proposed: null,
      avgIntakeKcal: null,
      estimatedTdee: null,
    });
    expect((await f.pending())?.id).toBe(first.id);
  });
  it('persists the insufficient scenario with six logged days and two weigh-ins', async () => {
    const saved = await f.started();
    await f.data(saved.goal.id, 'insufficient');
    expect(await f.pending()).toMatchObject({
      status: 'insufficient_data',
      loggedDays: 6,
      weighIns: 2,
    });
  });
  it('recognizes a weight goal progressing at the planned rate', async () => {
    const saved = await f.started();
    await f.data(saved.goal.id, 'on_track');
    expect(await f.pending()).toMatchObject({ status: 'on_track', loggedDays: 13, weighIns: 7 });
  });
  it('returns 404 for an unknown valid UUID', async () => {
    const response = await f.request(`/checkins/${crypto.randomUUID()}/resolve`, 'POST', {
      accept: true,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'checkin_not_found' } });
  });
  it('creates one pending row across concurrent and repeated calls', async () => {
    const saved = await f.started();
    await f.data(saved.goal.id);
    const results = await Promise.all([f.pending(), f.pending()]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect((await f.pending())!.id).toBe(results[0]!.id);
    expect(await f.db.select().from(table).where(eq(table.goalId, saved.goal.id))).toHaveLength(1);
  });
  it('accepts an adjustment for today and preserves yesterday macros and water', async () => {
    const { saved, checkin } = await adjustment();
    const before = targetSchema.parse(await (await f.request('/targets?date=2026-11-15')).json());
    const response = await f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: true });
    expect(response.status).toBe(200);
    expect(checkinSchema.parse(await response.json())).toMatchObject({
      accepted: true,
      proposed: checkin.proposed,
    });
    const current = targetSchema.parse(await (await f.request('/targets?date=2026-11-16')).json());
    expect(current).toEqual({
      kcal: checkin.proposed!.kcal,
      protein: checkin.proposed!.proteinG,
      carbs: checkin.proposed!.carbsG,
      fat: checkin.proposed!.fatG,
      waterMl: before.waterMl,
    });
    expect(await (await f.request('/targets?date=2026-11-15')).json()).toEqual(before);
    expect(await targetCount(saved.goal.id)).toBe(2);
    const [row] = await f.db.select().from(table).where(eq(table.id, checkin.id));
    expect(row!.targetId).toBeTruthy();
    expect(await f.pending()).toBeNull();
  });
  it('rejects without creating targets and rejects a second resolution', async () => {
    const { saved, checkin } = await adjustment();
    const response = await f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: false });
    expect(response.status).toBe(200);
    expect(checkinSchema.parse(await response.json()).accepted).toBe(false);
    expect(await targetCount(saved.goal.id)).toBe(1);
    const again = await f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: true });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'checkin_already_resolved' } });
  });
  it('creates one target for two concurrent acceptances', async () => {
    const { saved, checkin } = await adjustment();
    const responses = await Promise.all([
      f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: true }),
      f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: true }),
    ]);
    expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
    expect(await responses.find((row) => row.status === 409)!.json()).toMatchObject({
      error: { code: 'checkin_already_resolved' },
    });
    expect(await targetCount(saved.goal.id)).toBe(2);
  });
  it('isolates pending, resolve and history by session', async () => {
    const { checkin } = await adjustment();
    expect(await f.pending(1)).toBeNull();
    const response = await f.request(
      `/checkins/${checkin.id}/resolve`,
      'POST',
      { accept: true },
      1,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'checkin_not_found' } });
    expect((await f.pending())!.resolvedAt).toBeNull();
    await f.started('manual', 1);
    expect((await f.pending(1))!.goalId).not.toBe(checkin.goalId);
    const history = checkinsResponseSchema.parse(
      await (await f.request('/checkins', 'GET', undefined, 1)).json(),
    );
    expect(history.checkins.map((row) => row.id)).not.toContain(checkin.id);
  });
  it('lists all goals in week and creation order with a limit', async () => {
    const firstGoal = await f.started('manual');
    const first = (await f.pending())!;
    await f.db.insert(table).values({
      goalId: firstGoal.goal.id,
      weekStart: '2026-11-02',
      status: 'insufficient_data',
      loggedDays: 0,
      weighIns: 0,
      currentKcal: 2000,
      currentProteinG: '150',
      currentCarbsG: '200',
      currentFatG: '66',
    });
    await f.started('manual');
    const second = (await f.pending())!;
    await f.db
      .update(table)
      .set({ createdAt: sql`${new Date('2099-01-01').toISOString()}::timestamptz` })
      .where(eq(table.id, second.id));
    const history = checkinsResponseSchema.parse(
      await (await f.request('/checkins')).json(),
    ).checkins;
    expect(history).toHaveLength(3);
    expect(history.map((row) => row.id).slice(0, 2)).toEqual([second.id, first.id]);
    expect(history[2]!.weekStart).toBe('2026-11-02');
    expect(
      checkinsResponseSchema.parse(await (await f.request('/checkins?limit=1')).json()).checkins,
    ).toHaveLength(1);
  });
  it.each(['insufficient_data', 'on_track'] as const)(
    'dismisses %s without a new target',
    async (status) => {
      const saved = await f.started('manual');
      if (status === 'on_track') await f.data(saved.goal.id, 'on_track');
      const checkin = (await f.pending())!;
      expect(checkin.status).toBe(status);
      const response = await f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: true });
      expect(response.status).toBe(200);
      expect(checkinSchema.parse(await response.json())).toMatchObject({
        accepted: true,
        resolvedAt: expect.any(String),
      });
      expect(await targetCount(saved.goal.id)).toBe(1);
      expect(await f.pending()).toBeNull();
    },
  );
  it('rejects accepting an adjustment on an archived goal', async () => {
    const { saved, checkin } = await adjustment();
    await f.create();
    const response = await f.request(`/checkins/${checkin.id}/resolve`, 'POST', { accept: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'goal_not_active' } });
    expect(await targetCount(saved.goal.id)).toBe(1);
  });
  it('ignores unresolved checkins from earlier weeks', async () => {
    await f.started('manual');
    const first = (await f.pending())!;
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    const next = (await f.pending())!;
    expect(next.weekStart).toBe('2026-11-16');
    expect(next.id).not.toBe(first.id);
  });
});

describe('checkins validation without database', () => {
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/checkins', checkins);
  validationApp.onError(handleError);
  it.each([0, 53])('rejects limit %s', async (limit) => {
    expect((await validationApp.request(`/api/checkins?limit=${limit}`, {}, testEnv)).status).toBe(
      400,
    );
  });
  it('returns 404 for a malformed id', async () => {
    const response = await validationApp.request(
      '/api/checkins/no-uuid/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept: true }),
      },
      testEnv,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'checkin_not_found' } });
  });
  it('validates the resolution body', async () => {
    expect(
      (
        await validationApp.request(
          `/api/checkins/${crypto.randomUUID()}/resolve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept: 'true' }),
          },
          testEnv,
        )
      ).status,
    ).toBe(400);
  });
  it.each([
    ['GET', '/checkins'],
    ['GET', '/checkins/pending'],
    ['POST', `/checkins/${crypto.randomUUID()}/resolve`],
  ])('requires auth for %s %s', async (method, path) => {
    expect((await app.request(`/api${path}`, { method }, testEnv)).status).toBe(401);
  });
});
