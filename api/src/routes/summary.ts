import {
  MEALS,
  isoWeekRange,
  summaryWeekQuerySchema,
  type WeekSummary,
  roundMacros,
  sumMacros,
  summaryDayQuerySchema,
  type DaySummary,
  type EntryStatus,
} from '@lean/shared';
import { and, eq, sql } from 'drizzle-orm';
import { exerciseLogs } from '../db/schema';
import { selectWater } from './water';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { getTargetForDate, resolveTargetsByDay, selectTargetsForRange } from '../lib/targets';
import { firstTarget, interpolateWeight, selectMilestones } from '../lib/goals';
import { validate } from '../lib/validate';
import { selectEntries, serializeEntry, storedMacros } from './entries';

export const summary = new Hono<AppEnv>();
summary.get('/day', validate('query', summaryDayQuerySchema), async (c) => {
  const { date } = c.req.valid('query'),
    db = getDb(c.env),
    userId = c.get('userId');
  const [rows, target, waterMl, exerciseTotals] = await Promise.all([
    selectEntries(db, userId, date, date),
    getTargetForDate(db, userId, date),
    selectWater(db, userId, date),
    db
      .select({ kcal: sql<number>`coalesce(sum(${exerciseLogs.kcal}), 0)`.mapWith(Number) })
      .from(exerciseLogs)
      .where(and(eq(exerciseLogs.userId, userId), eq(exerciseLogs.date, date))),
  ]);
  const total = (items: typeof rows, status: EntryStatus) =>
    roundMacros(
      sumMacros(items.filter((r) => r.entry.status === status).map((r) => storedMacros(r.entry))),
    );
  const result: DaySummary = {
    date,
    eaten: total(rows, 'eaten'),
    planned: total(rows, 'planned'),
    meals: MEALS.map((meal) => {
      const items = rows.filter((r) => r.entry.meal === meal);
      return {
        meal,
        eaten: total(items, 'eaten'),
        planned: total(items, 'planned'),
        entries: items.map(serializeEntry),
      };
    }),
    target,
    waterMl,
    exerciseKcal: exerciseTotals[0]?.kcal ?? 0,
  };
  return c.json(result);
});

summary.get('/week', validate('query', summaryWeekQuerySchema), async (c) => {
  const { week } = c.req.valid('query'),
    db = getDb(c.env),
    userId = c.get('userId');
  const { from, to } = isoWeekRange(week);
  const [entries, targetRows] = await Promise.all([
    selectEntries(db, userId, from, to),
    selectTargetsForRange(db, userId, from, to),
  ]);
  const rows = entries.filter((row) => row.entry.status === 'eaten');
  const dates = Array.from({ length: 7 }, (_, index) =>
    new Date(Date.parse(from) + index * 86400000).toISOString().slice(0, 10),
  );
  const dailyTargets = resolveTargetsByDay(targetRows, dates);
  const days = dates.map((date, index) => {
    return {
      date,
      eatenKcal: Math.round(
        sumMacros(
          rows.filter((row) => row.entry.date === date).map((row) => storedMacros(row.entry)),
        ).kcal,
      ),
      targetKcal: dailyTargets[index]?.target.kcal ?? null,
    };
  });
  const eatenKcal = days.reduce((sum, day) => sum + day.eatenKcal, 0);
  const budgetKcal = days.some((day) => day.targetKcal !== null)
    ? days.reduce((sum, day) => sum + (day.targetKcal ?? 0), 0)
    : null;
  const owner = dailyTargets.at(-1);
  let expectedWeightKg: number | null = null;
  if (owner) {
    const [initial, points] = await Promise.all([
      firstTarget(db, userId, owner.goal.id),
      selectMilestones(db, userId, owner.goal.id),
    ]);
    expectedWeightKg = interpolateWeight(
      initial.effectiveFrom,
      Number(owner.goal.startWeightKg),
      points,
      to,
    );
  }
  const result: WeekSummary = {
    week,
    from,
    to,
    days,
    eatenKcal,
    budgetKcal,
    remainingKcal: budgetKcal === null ? null : budgetKcal - eatenKcal,
    loggedDays: new Set(rows.map((row) => row.entry.date)).size,
    expectedWeightKg,
  };
  return c.json(result);
});
