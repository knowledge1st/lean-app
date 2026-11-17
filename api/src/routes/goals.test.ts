import * as shared from '@lean/shared';
import {
  activeGoalSchema,
  daySummarySchema,
  planSchema,
  targetSchema,
  weekSummarySchema,
} from '@lean/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { completeProfile, goalsFixture, manualGoal, weightGoal } from '../../test/helpers/goals';
import * as dbClient from '../db/client';
import { bodyLogs, goals as goalTable, milestones, targets as targetTable } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { firstTarget, selectMilestones, serializeGoal } from '../lib/goals';
import { testEnv } from '../test-env';
import { goals, targets } from './goals';

const today = '2026-11-16';
const targetFrom = (plan: shared.PlanResponse) => ({
  kcal: plan.daily.kcal,
  protein: plan.daily.proteinG,
  carbs: plan.daily.carbsG,
  fat: plan.daily.fatG,
  waterMl: plan.daily.waterMl,
});
describe.skipIf(!hasTestDatabase)('goals integration', { timeout: 30_000 }, () => {
  let f: ReturnType<typeof goalsFixture>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
    f = goalsFixture();
    await f.setup();
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await f.cleanup();
  }, 30_000);
  it('previews without changing any user rows, with and without a profile', async () => {
    const beforeManual = await f.counts();
    const manual = await f.request('/goals/preview', 'POST', manualGoal);
    expect(manual.status).toBe(200);
    planSchema.parse(await manual.json());
    expect(await f.counts()).toEqual(beforeManual);
    await f.profile();
    const before = await f.counts();
    const response = await f.request('/goals/preview', 'POST', weightGoal);
    expect(response.status).toBe(200);
    const plan = planSchema.parse(await response.json());
    expect(plan.milestones.length).toBeGreaterThan(0);
    expect(await f.counts()).toEqual(before);
  });
  it('creates all rows atomically and archives the previous goal', async () => {
    await f.profile();
    const first = await f.create({ ...weightGoal, bodyFatPct: 23.5 });
    expect(first.goal).toMatchObject({
      startDate: today,
      startWeightKg: 100,
      targetWeightKg: 90,
      mode: 'weight_date',
      preset: null,
    });
    expect(first.goal.milestones).toEqual(first.plan.milestones);
    expect(await f.counts()).toEqual([1, 1, first.plan.milestones.length, 1, 1]);
    const [initial] = await f.db
      .select()
      .from(targetTable)
      .where(eq(targetTable.goalId, first.goal.id));
    expect(initial).toMatchObject({
      reason: 'initial',
      effectiveFrom: today,
      kcal: first.plan.daily.kcal,
    });
    const [log] = await f.db
      .select()
      .from(bodyLogs)
      .where(eq(bodyLogs.userId, f.accounts[0]!.user.id));
    expect(log).toMatchObject({ date: today, weightKg: '100.00', bodyFatPct: '23.5' });
    const second = await f.create({ ...manualGoal, weightKg: 99 });
    const rows = await f.db
      .select()
      .from(goalTable)
      .where(eq(goalTable.userId, f.accounts[0]!.user.id));
    expect(rows.filter((row) => row.status === 'active').map((row) => row.id)).toEqual([
      second.goal.id,
    ]);
    expect(rows.find((row) => row.id === first.goal.id)?.status).toBe('archived');
    const [updatedLog] = await f.db
      .select()
      .from(bodyLogs)
      .where(eq(bodyLogs.userId, f.accounts[0]!.user.id));
    expect(updatedLog).toMatchObject({ weightKg: '99.00', bodyFatPct: '23.5' });
    expect((await f.request('/goals/active')).status).toBe(200);
    expect(activeGoalSchema.parse(await (await f.request('/goals/active')).json()).id).toBe(
      second.goal.id,
    );
  });
  it('treats an adjusted date beyond five years as unreachable in preview and creation', async () => {
    const profile = await f.request('/profile', 'PUT', {
      ...completeProfile,
      birthDate: '1951-01-01',
      heightCm: 100,
      activityLevel: 'sedentary',
    });
    expect(profile.status).toBe(200);
    const input = {
      weightKg: 100,
      goal: { mode: 'weight_date', targetWeightKg: 20, targetDate: '2027-05-01' },
    };
    const preview = await f.request('/goals/preview', 'POST', input);
    expect(preview.status).toBe(200);
    const plan = planSchema.parse(await preview.json());
    expect(plan.warnings).toContainEqual({ code: 'date_unreachable' });
    expect(plan).not.toHaveProperty('adjusted');
    expect(plan.milestones).toEqual([]);

    const saved = await f.create(input);
    expect(saved.plan).toEqual(plan);
    expect(saved.goal.targetDate).toBe('2027-05-01');
    expect(saved.goal.milestones).toEqual([]);
    const [row] = await f.db.select().from(goalTable).where(eq(goalTable.id, saved.goal.id));
    expect(row?.targetDate).toBe('2027-05-01');
    expect(
      await f.db.select().from(milestones).where(eq(milestones.goalId, saved.goal.id)),
    ).toHaveLength(0);
  });
  it('rolls back an entire failed batch after archiving the prior goal', async () => {
    await f.profile();
    const previous = await f.create();
    const before = await f.counts();
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    const validPlan = shared.buildPlan(
      { sex: 'male', birthDate: '1990-01-01', heightCm: 180, activity: 'moderate' },
      { weightKg: 100 },
      { mode: 'weight_date', targetWeightKg: 90, targetDate: '2027-05-01' },
      '2026-11-17',
    );
    const point = validPlan.milestones[0]!;
    vi.spyOn(shared, 'buildPlan').mockReturnValueOnce({
      ...validPlan,
      milestones: [point, { ...point, kind: 'final' }],
    });
    const response = await f.request('/goals', 'POST', weightGoal);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: 'internal_error' } });
    expect(await f.counts()).toEqual(before);
    const rows = await f.db
      .select()
      .from(goalTable)
      .where(eq(goalTable.userId, f.accounts[0]!.user.id));
    expect(rows.map((row) => ({ id: row.id, status: row.status }))).toEqual([
      { id: previous.goal.id, status: 'active' },
    ]);
    expect(
      await f.db
        .select()
        .from(bodyLogs)
        .where(and(eq(bodyLogs.userId, f.accounts[0]!.user.id), eq(bodyLogs.date, '2026-11-17'))),
    ).toHaveLength(0);
  });
  it('breaks historical target ties by creation time and then id', async () => {
    const saved = await f.create();
    const prefix = crypto.randomUUID().slice(0, 24);
    const base = {
      goalId: saved.goal.id,
      effectiveFrom: today,
      proteinG: '150',
      carbsG: '200',
      fatG: '60',
      waterMl: 3500,
      reason: 'adjustment' as const,
    };
    await f.db.insert(targetTable).values([
      {
        ...base,
        id: `${prefix}000000000001`,
        createdAt: new Date('2099-01-01T00:00:00Z'),
        kcal: 2200,
      },
      {
        ...base,
        id: `${prefix}000000000002`,
        createdAt: new Date('2099-01-01T00:00:00Z'),
        kcal: 2300,
      },
      {
        ...base,
        id: `${prefix}ffffffffffff`,
        createdAt: new Date('2098-01-01T00:00:00Z'),
        kcal: 2400,
      },
    ]);
    expect(targetSchema.parse(await (await f.request(`/targets?date=${today}`)).json()).kcal).toBe(
      2300,
    );
  });
  it('preserves yesterday targets and exposes the full target in the daily summary', async () => {
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    const first = await f.create();
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    const second = await f.create({ ...manualGoal, goal: { ...manualGoal.goal, kcal: 2500 } });
    expect(await (await f.request('/targets?date=2026-11-14')).json()).toBeNull();
    expect(targetSchema.parse(await (await f.request('/targets?date=2026-11-15')).json())).toEqual(
      targetFrom(first.plan),
    );
    expect(targetSchema.parse(await (await f.request(`/targets?date=${today}`)).json())).toEqual(
      targetFrom(second.plan),
    );
    expect(
      daySummarySchema.parse(await (await f.request(`/summary/day?date=${today}`)).json()).target,
    ).toEqual(targetFrom(second.plan));
  });
  it.each(['weight_date', 'composition'] as const)(
    'requires a complete profile for %s',
    async (mode) => {
      const input =
        mode === 'weight_date' ? weightGoal : { weightKg: 100, goal: { mode, preset: 'cut' } };
      for (const path of ['/goals/preview', '/goals']) {
        const response = await f.request(path, 'POST', input);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: 'profile_required' } });
      }
      expect((await f.create()).goal.mode).toBe('manual');
    },
  );
  it('rolls back an archive and every new row after a milestone constraint failure', async () => {
    await f.profile();
    const previous = await f.create();
    const before = await f.counts();
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    const plan = shared.buildPlan(
      { sex: 'male', birthDate: '1990-01-01', heightCm: 180, activity: 'moderate' },
      { weightKg: 100 },
      { mode: 'weight_date', targetWeightKg: 90, targetDate: '2027-05-01' },
      '2026-11-17',
    );
    const point = plan.milestones[0]!;
    vi.spyOn(shared, 'buildPlan').mockReturnValue({ ...plan, milestones: [point, point] });
    const response = await f.request('/goals', 'POST', weightGoal);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: 'internal_error' } });
    expect(await f.counts()).toEqual(before);
    const [active] = await f.db
      .select()
      .from(goalTable)
      .where(and(eq(goalTable.userId, f.accounts[0]!.user.id), eq(goalTable.status, 'active')));
    expect(active?.id).toBe(previous.goal.id);
    const logs = await f.db
      .select()
      .from(bodyLogs)
      .where(and(eq(bodyLogs.userId, f.accounts[0]!.user.id), eq(bodyLogs.date, '2026-11-17')));
    expect(logs).toHaveLength(0);
  });
  it('isolates goals, profiles, targets and summaries', async () => {
    await f.profile();
    await f.create();
    const food = await f.food();
    await f.entry(food.id!, { date: today });
    expect((await f.request('/profile', 'GET', undefined, 1)).status).toBe(404);
    const active = await f.request('/goals/active', 'GET', undefined, 1);
    expect(active.status).toBe(404);
    expect(await active.json()).toMatchObject({ error: { code: 'goal_not_found' } });
    expect(
      await (await f.request(`/targets?date=${today}`, 'GET', undefined, 1)).json(),
    ).toBeNull();
    expect(
      daySummarySchema.parse(
        await (await f.request(`/summary/day?date=${today}`, 'GET', undefined, 1)).json(),
      ),
    ).toMatchObject({ eaten: { kcal: 0 }, target: null });
    const week = weekSummarySchema.parse(
      await (await f.request('/summary/week?week=2026-W47', 'GET', undefined, 1)).json(),
    );
    expect(week).toMatchObject({
      eatenKcal: 0,
      budgetKcal: null,
      remainingKcal: null,
      loggedDays: 0,
      expectedWeightKg: null,
    });
    expect(week.days.every((day) => day.targetKcal === null && day.eatenKcal === 0)).toBe(true);
  });
  it('keeps the other user active goal, targets and body log when a user creates a goal', async () => {
    const own = await f.create();
    const before = await f.counts(0);
    await f.create(manualGoal, 1);
    await f.create(manualGoal, 1);
    expect(await f.counts(0)).toEqual(before);
    const active = await f.request('/goals/active');
    expect(active.status).toBe(200);
    expect(activeGoalSchema.parse(await active.json()).id).toBe(own.goal.id);
  });
  it('scopes goal helpers to the session user even with another user goal id', async () => {
    await f.profile();
    const saved = await f.create(weightGoal);
    const userId = f.accounts[0]!.user.id;
    const otherUserId = f.accounts[1]!.user.id;
    expect(await selectMilestones(f.db, userId, saved.goal.id)).toEqual(saved.plan.milestones);
    expect(await firstTarget(f.db, userId, saved.goal.id)).toMatchObject({
      goalId: saved.goal.id,
      effectiveFrom: today,
    });
    expect(await selectMilestones(f.db, otherUserId, saved.goal.id)).toEqual([]);
    await expect(firstTarget(f.db, otherUserId, saved.goal.id)).rejects.toThrow(
      'Objetivo sin meta inicial',
    );
    const [row] = await f.db
      .select()
      .from(goalTable)
      .where(and(eq(goalTable.id, saved.goal.id), eq(goalTable.userId, userId)));
    expect(row).toBeDefined();
    await expect(serializeGoal(f.db, otherUserId, row!, today)).rejects.toThrow(
      'Objetivo sin meta inicial',
    );
  });
  it('persists the adjusted target date and reconstructs milestone kinds and progress', async () => {
    await f.profile();
    const saved = await f.create({
      weightKg: 100,
      goal: { mode: 'weight_date', targetWeightKg: 80, targetDate: '2026-11-30' },
    });
    expect(saved.plan.adjusted?.targetDate).toBeDefined();
    expect(saved.goal.targetDate).toBe(saved.plan.adjusted?.targetDate);
    const [row] = await f.db.select().from(goalTable).where(eq(goalTable.id, saved.goal.id));
    expect(row?.targetDate).toBe(saved.plan.adjusted?.targetDate);
    await f.db.insert(bodyLogs).values([
      { userId: f.accounts[0]!.user.id, date: '2026-11-17', weightKg: '95' },
      { userId: f.accounts[0]!.user.id, date: '2026-11-18', weightKg: null },
      { userId: f.accounts[0]!.user.id, date: '2026-11-20', weightKg: '85' },
    ]);
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const active = activeGoalSchema.parse(await (await f.request('/goals/active')).json());
    expect(active.milestones).toEqual(saved.plan.milestones);
    expect(active.progress).toEqual({
      startWeightKg: 100,
      currentWeightKg: 95,
      targetWeightKg: 80,
      percent: 25,
    });
  });
  it('uses the latest eligible target of this goal and the earliest when all are future', async () => {
    const saved = await f.create();
    await f.db.insert(targetTable).values({
      goalId: saved.goal.id,
      effectiveFrom: '2026-11-17',
      kcal: 2200,
      proteinG: '160',
      carbsG: '240',
      fatG: '65',
      waterMl: 3500,
      reason: 'adjustment',
    });
    expect(
      activeGoalSchema.parse(await (await f.request('/goals/active')).json()).target.kcal,
    ).toBe(2000);
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    expect(
      activeGoalSchema.parse(await (await f.request('/goals/active')).json()).target.kcal,
    ).toBe(2200);
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    expect(
      activeGoalSchema.parse(await (await f.request('/goals/active')).json()).target.kcal,
    ).toBe(2000);
  });
  it('uses the profile timezone to determine today and rejects dates beyond five years', async () => {
    vi.setSystemTime(new Date('2026-11-17T01:00:00Z'));
    const profile = await f.request('/profile', 'PUT', {
      ...completeProfile,
      timeZone: 'Asia/Tokyo',
    });
    expect(profile.status).toBe(200);
    const saved = await f.create();
    expect(saved.goal.startDate).toBe('2026-11-17');
    expect(await firstTarget(f.db, f.accounts[0]!.user.id, saved.goal.id)).toMatchObject({
      effectiveFrom: '2026-11-17',
    });
    const logs = await f.db
      .select()
      .from(bodyLogs)
      .where(eq(bodyLogs.userId, f.accounts[0]!.user.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ date: '2026-11-17', weightKg: '100.00' });
    expect(activeGoalSchema.parse(await (await f.request('/goals/active')).json()).startDate).toBe(
      '2026-11-17',
    );
    for (const path of ['/goals', '/goals/preview']) {
      const boundary = await f.request(path, 'POST', {
        ...weightGoal,
        goal: { ...weightGoal.goal, targetDate: '2031-11-17' },
      });
      expect(boundary.status).toBe(path === '/goals' ? 201 : 200);
      const response = await f.request(path, 'POST', {
        ...weightGoal,
        goal: { ...weightGoal.goal, targetDate: '2031-11-18' },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });
  it('serializes concurrent creations with exactly one active goal', async () => {
    const responses = await Promise.all([
      f.request('/goals', 'POST', manualGoal),
      f.request('/goals', 'POST', manualGoal),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const rows = await f.db
      .select()
      .from(goalTable)
      .where(eq(goalTable.userId, f.accounts[0]!.user.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1);
  });
});
describe('goals validation without database', () => {
  const validationApp = new Hono<AppEnv>();
  validationApp.use('*', async (c, next) => {
    c.set('userId', crypto.randomUUID());
    await next();
  });
  validationApp.route('/api/goals', goals);
  validationApp.route('/api/targets', targets);
  validationApp.onError(handleError);
  afterEach(() => vi.restoreAllMocks());
  it.each([
    ['23505', 'goals_one_active_idx', 409, 'goal_conflict'],
    ['23505', 'milestones_goal_id_date_idx', 500, 'internal_error'],
    ['23514', 'targets_kcal_check', 500, 'internal_error'],
  ])('maps batch failure %s on %s to %s', async (code, constraint, status, errorCode) => {
    const batch = vi
      .fn()
      .mockRejectedValue(new Error('Batch fallido', { cause: { code, constraint } }));
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      execute: vi.fn(),
      update: () => ({ set: () => ({ where: vi.fn() }) }),
      insert: () => ({ values: () => ({ returning: vi.fn(), onConflictDoUpdate: vi.fn() }) }),
      batch,
    } as unknown as dbClient.Db;
    vi.spyOn(dbClient, 'getDb').mockReturnValue(db);
    const response = await validationApp.request(
      '/api/goals',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualGoal),
      },
      testEnv,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code: errorCode } });
    expect(batch).toHaveBeenCalledOnce();
  });
  it('supports spying on the engine for rollback fault injection', async () => {
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }),
      batch: vi.fn(),
    } as unknown as dbClient.Db;
    vi.spyOn(dbClient, 'getDb').mockReturnValue(db);
    const engine = vi.spyOn(shared, 'buildPlan');
    const response = await validationApp.request(
      '/api/goals/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualGoal),
      },
      testEnv,
    );
    expect(response.status).toBe(200);
    expect(engine).toHaveBeenCalledOnce();
    expect(db.batch).not.toHaveBeenCalled();
  });
  it.each(['/goals', '/goals/preview'])('rejects an invalid goal at %s', async (path) => {
    const response = await validationApp.request(
      `/api${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...manualGoal, goal: { ...manualGoal.goal, kcal: 499 } }),
      },
      testEnv,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it('rejects invalid target dates', async () => {
    expect((await validationApp.request('/api/targets?date=2026-02-30', {}, testEnv)).status).toBe(
      400,
    );
  });
  it.each([
    ['GET', '/profile'],
    ['PUT', '/profile'],
    ['GET', '/goals/active'],
    ['POST', '/goals'],
    ['POST', '/goals/preview'],
    ['GET', `/targets?date=${today}`],
    ['GET', '/summary/week?week=2026-W47'],
  ])('requires authentication for %s %s', async (method, path) => {
    expect((await app.request(`/api${path}`, { method }, testEnv)).status).toBe(401);
  });
});
