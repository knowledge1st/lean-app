import {
  daySummarySchema,
  MEALS,
  ZERO_MACROS,
  type DaySummary,
  type Entry,
  weekSummarySchema,
} from '@lean/shared';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { goalsFixture, weightGoal } from '../../test/helpers/goals';
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
      waterMl: 0,
      exerciseKcal: 0,
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
  it('sums daily water and exercise without changing targets and isolates users', async () => {
    const before = daySummarySchema.parse(
      await (await f.request('/summary/day?date=2026-11-14')).json(),
    );
    await f.request('/water', 'POST', { date: '2026-11-14', ml: 500 });
    for (const kcal of [100, 250])
      await f.request('/exercise', 'POST', {
        date: '2026-11-14',
        activity: 'Caminar',
        minutes: 30,
        kcal,
      });
    await f.request('/water', 'POST', { date: '2026-11-15', ml: 900 });
    await f.request('/exercise', 'POST', {
      date: '2026-11-15',
      activity: 'Correr',
      minutes: 30,
      kcal: 500,
    });
    const after = daySummarySchema.parse(
      await (await f.request('/summary/day?date=2026-11-14')).json(),
    );
    expect(after).toEqual({ ...before, waterMl: 500, exerciseKcal: 350 });
    expect(
      await (await f.request('/summary/day?date=2026-11-14', 'GET', undefined, 1)).json(),
    ).toMatchObject({ waterMl: 0, exerciseKcal: 0 });
  });
  it('rounds a stored protein sum at a decimal tie in the day and meal totals', async () => {
    const food = await f.food(0, { protein: 0.5 });
    await f.entry(food.id!, { grams: 1, meal: 'lunch' });
    await f.entry(food.id!, { grams: 9, meal: 'lunch' });
    const response = await f.request('/summary/day?date=2026-11-14');
    expect(response.status).toBe(200);
    const result = daySummarySchema.parse(await response.json());
    expect(result.eaten.protein).toBe(0.1);
    expect(result.meals.find((m) => m.meal === 'lunch')?.eaten.protein).toBe(0.1);
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
        waterMl: 0,
        exerciseKcal: 0,
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
  it.each(['2100-W52', '2021-W53', '2026-W00', '2026-W54', 'bad', ''])(
    'rejects invalid week %s',
    async (week) => {
      const response = await validationApp.request(`/api/summary/week?week=${week}`, {}, testEnv);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    },
  );
  it('requires a token', async () => {
    expect((await app.request('/api/summary/day?date=2026-11-14', {}, testEnv)).status).toBe(401);
  });
});

describe.skipIf(!hasTestDatabase)('weekly summary integration', { timeout: 30_000 }, () => {
  let f: ReturnType<typeof goalsFixture>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    f = goalsFixture();
    await f.setup();
  }, 30_000);
  afterEach(async () => {
    vi.useRealTimers();
    await f.cleanup();
  }, 30_000);
  it.each([
    ['2026-11-16', 7],
    ['2026-11-19', 4],
  ])('sums eaten entries and budgets starting %s', async (start, targetDays) => {
    vi.setSystemTime(new Date(`${start}T12:00:00Z`));
    await f.create();
    const food = await f.food();
    // Three individually rounded entries total 201, but their stored sum rounds to 200.
    for (let i = 0; i < 3; i++) await f.entry(food.id!, { date: '2026-11-16', grams: 33.3 });
    await f.entry(food.id!, { date: '2026-11-18', grams: 100 });
    await f.entry(food.id!, { date: '2026-11-22', grams: 150 });
    await f.entry(food.id!, { date: '2026-11-20', status: 'planned', grams: 400 });
    await f.entry(food.id!, { date: '2026-11-23', grams: 400 });
    const response = await f.request('/summary/week?week=2026-W47');
    expect(response.status).toBe(200);
    const result = weekSummarySchema.parse(await response.json());
    expect(result).toMatchObject({
      week: '2026-W47',
      from: '2026-11-16',
      to: '2026-11-22',
      eatenKcal: 700,
      budgetKcal: targetDays * 2000,
      remainingKcal: targetDays * 2000 - 700,
      loggedDays: 3,
      expectedWeightKg: null,
    });
    expect(result.days.map((day) => day.eatenKcal)).toEqual([200, 0, 200, 0, 0, 0, 300]);
    expect(result.days.map((day) => day.date)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(result.days.map((day) => day.targetKcal)).toEqual(
      Array(7 - targetDays)
        .fill(null)
        .concat(Array(targetDays).fill(2000)),
    );
  });
  it('keeps a real daily target and weekly budget unchanged by exercise', async () => {
    await f.create();
    const before = daySummarySchema.parse(
      await (await f.request('/summary/day?date=2026-11-16')).json(),
    );
    const weekBefore = await (await f.request('/summary/week?week=2026-W47')).json();
    expect(before.target?.kcal).toBe(2000);
    await f.request('/exercise', 'POST', {
      date: '2026-11-16',
      activity: 'Correr',
      minutes: 60,
      kcal: 750,
    });
    const after = daySummarySchema.parse(
      await (await f.request('/summary/day?date=2026-11-16')).json(),
    );
    expect(after).toEqual({ ...before, exerciseKcal: 750 });
    expect(await (await f.request('/summary/week?week=2026-W47')).json()).toEqual(weekBefore);
  });
  it('switches targets midweek and uses the Sunday owner for expected weight', async () => {
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    await f.create();
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    await f.profile();
    const saved = await f.create(weightGoal);
    const response = await f.request('/summary/week?week=2026-W47');
    expect(response.status).toBe(200);
    const result = weekSummarySchema.parse(await response.json());
    const kcal = saved.plan.daily.kcal;
    expect(result.days.map((day) => day.targetKcal)).toEqual([2000, 2000, ...Array(5).fill(kcal)]);
    const first = saved.plan.milestones[0]!;
    const expected = Math.round((100 + ((first.expectedWeightKg - 100) * 4) / 7) * 10) / 10;
    expect(result).toMatchObject({
      budgetKcal: 2 * 2000 + 5 * kcal,
      expectedWeightKg: expected,
    });
  });
  it('allows negative remaining calories and returns null without a budget', async () => {
    const food = await f.food();
    await f.entry(food.id!, { date: '2026-11-22', grams: 1000 });
    const empty = weekSummarySchema.parse(
      await (await f.request('/summary/week?week=2026-W47')).json(),
    );
    expect(empty).toMatchObject({ eatenKcal: 2000, budgetKcal: null, remainingKcal: null });
    vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
    await f.create({
      weightKg: 100,
      goal: { mode: 'manual', kcal: 500, proteinG: 50, carbsG: 50, fatG: 10 },
    });
    const result = weekSummarySchema.parse(
      await (await f.request('/summary/week?week=2026-W47')).json(),
    );
    expect(result).toMatchObject({ budgetKcal: 500, remainingKcal: -1500 });
  });
  it('interpolates the Sunday goal and retains the archived goal curve for earlier weeks', async () => {
    await f.profile();
    const saved = await f.create(weightGoal);
    const first = saved.plan.milestones[0]!;
    const expected = Math.round((100 + ((first.expectedWeightKg - 100) * 6) / 7) * 10) / 10;
    const initialWeek = weekSummarySchema.parse(
      await (await f.request('/summary/week?week=2026-W47')).json(),
    );
    expect(initialWeek.expectedWeightKg).toBe(expected);
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    await f.create();
    const historical = weekSummarySchema.parse(
      await (await f.request('/summary/week?week=2026-W47')).json(),
    );
    expect(historical.expectedWeightKg).toBe(expected);
    const current = weekSummarySchema.parse(
      await (await f.request('/summary/week?week=2026-W48')).json(),
    );
    expect(current.expectedWeightKg).toBeNull();
  });
});
