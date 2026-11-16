import type { ActiveGoal, Milestone, Plan } from '@lean/shared';
import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bodyLogs, goals, milestones, targets, type Goal } from '../db/schema';
import { serializeTarget } from './targets';

export function maxGoalTargetDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 5);
  return date.toISOString().slice(0, 10);
}

export function limitAdjustedTargetDate(plan: Plan, today: string): Plan {
  if (!plan.adjusted || plan.adjusted.targetDate <= maxGoalTargetDate(today)) return plan;
  const result = { ...plan };
  delete result.adjusted;
  result.milestones = [];
  result.warnings = plan.warnings.some((warning) => warning.code === 'date_unreachable')
    ? plan.warnings
    : [...plan.warnings, { code: 'date_unreachable' }];
  return result;
}

export function deriveMilestoneKinds(
  points: { date: string; expectedWeightKg: number }[],
): Milestone[] {
  return points.map((point, index) => ({
    ...point,
    kind:
      index === points.length - 1
        ? 'final'
        : index === points.length - 2 ||
            point.date.slice(0, 7) !== points[index + 1]?.date.slice(0, 7)
          ? 'month'
          : 'week',
  }));
}
export async function selectMilestones(db: Db, userId: string, goalId: string) {
  const rows = await db
    .select({ date: milestones.date, expectedWeightKg: milestones.expectedWeightKg })
    .from(milestones)
    .innerJoin(goals, eq(milestones.goalId, goals.id))
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .orderBy(asc(milestones.date));
  return deriveMilestoneKinds(
    rows.map((r) => ({ date: r.date, expectedWeightKg: Number(r.expectedWeightKg) })),
  );
}
export async function firstTarget(db: Db, userId: string, goalId: string) {
  const [row] = await db
    .select({ target: targets })
    .from(targets)
    .innerJoin(goals, eq(targets.goalId, goals.id))
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .orderBy(asc(targets.effectiveFrom), asc(targets.createdAt), asc(targets.id))
    .limit(1);
  if (!row) throw new Error('Objetivo sin meta inicial');
  return row.target;
}
export async function serializeGoal(
  db: Db,
  userId: string,
  row: Goal,
  today: string,
): Promise<ActiveGoal> {
  const [initial, points, currentRows, targetRows] = await Promise.all([
    firstTarget(db, userId, row.id),
    selectMilestones(db, userId, row.id),
    db
      .select()
      .from(bodyLogs)
      .where(
        and(eq(bodyLogs.userId, userId), lte(bodyLogs.date, today), isNotNull(bodyLogs.weightKg)),
      )
      .orderBy(desc(bodyLogs.date))
      .limit(1),
    db
      .select({ target: targets })
      .from(targets)
      .innerJoin(goals, eq(targets.goalId, goals.id))
      .where(and(eq(goals.id, row.id), eq(goals.userId, userId), lte(targets.effectiveFrom, today)))
      .orderBy(desc(targets.effectiveFrom), desc(targets.createdAt), desc(targets.id))
      .limit(1),
  ]);
  const startWeightKg = Number(row.startWeightKg);
  const targetWeightKg = row.targetWeightKg === null ? null : Number(row.targetWeightKg);
  const currentWeightKg =
    currentRows[0]?.weightKg == null ? startWeightKg : Number(currentRows[0].weightKg);
  const percent =
    targetWeightKg === null || startWeightKg === targetWeightKg
      ? null
      : Math.round(
          Math.max(
            0,
            Math.min(
              100,
              ((startWeightKg - currentWeightKg) / (startWeightKg - targetWeightKg)) * 100,
            ),
          ) * 10,
        ) / 10;
  return {
    id: row.id,
    mode:
      row.mode === 'target_weight'
        ? 'weight_date'
        : row.mode === 'body_composition'
          ? 'composition'
          : 'manual',
    preset: row.preset,
    startDate: initial.effectiveFrom,
    startWeightKg,
    targetWeightKg,
    targetDate: row.targetDate,
    target: serializeTarget(targetRows[0]?.target ?? initial),
    milestones: points,
    progress: { startWeightKg, currentWeightKg, targetWeightKg, percent },
  };
}
export function interpolateWeight(
  startDate: string,
  startWeightKg: number,
  points: { date: string; expectedWeightKg: number }[],
  date: string,
): number | null {
  if (!points.length) return null;
  let previous = { date: startDate, expectedWeightKg: startWeightKg };
  let weight = startWeightKg;
  for (const point of points) {
    if (date <= previous.date) break;
    if (date <= point.date) {
      const fraction =
        (Date.parse(date) - Date.parse(previous.date)) /
        (Date.parse(point.date) - Date.parse(previous.date));
      weight =
        previous.expectedWeightKg + fraction * (point.expectedWeightKg - previous.expectedWeightKg);
      break;
    }
    previous = point;
    weight = point.expectedWeightKg;
  }
  return Math.round(weight * 10) / 10;
}
