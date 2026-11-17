import type { Target } from '@lean/shared';
import { and, desc, eq, gt, lte, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { goals, targets, type Target as TargetRow } from '../db/schema';

export const serializeTarget = (row: TargetRow): Target => ({
  kcal: row.kcal,
  protein: Number(row.proteinG),
  carbs: Number(row.carbsG),
  fat: Number(row.fatG),
  waterMl: row.waterMl,
});
export async function selectTargetForDate(db: Db, userId: string, date: string) {
  const [row] = await db
    .select({ target: targets, goal: goals })
    .from(targets)
    .innerJoin(goals, eq(targets.goalId, goals.id))
    .where(and(eq(goals.userId, userId), lte(targets.effectiveFrom, date)))
    .orderBy(desc(targets.effectiveFrom), desc(targets.createdAt), desc(targets.id))
    .limit(1);
  return row;
}
export async function selectTargetsForRange(db: Db, userId: string, from: string, to: string) {
  const initial = db
    .select({ id: targets.id })
    .from(targets)
    .innerJoin(goals, eq(targets.goalId, goals.id))
    .where(and(eq(goals.userId, userId), lte(targets.effectiveFrom, from)))
    .orderBy(desc(targets.effectiveFrom), desc(targets.createdAt), desc(targets.id))
    .limit(1);
  return db
    .select({ target: targets, goal: goals })
    .from(targets)
    .innerJoin(goals, eq(targets.goalId, goals.id))
    .where(
      and(
        eq(goals.userId, userId),
        lte(targets.effectiveFrom, to),
        or(gt(targets.effectiveFrom, from), eq(targets.id, initial)),
      ),
    )
    .orderBy(desc(targets.effectiveFrom), desc(targets.createdAt), desc(targets.id));
}

/** Receives rows in priority order, as returned by selectTargetsForRange. */
export function resolveTargetsByDay<T extends { target: Pick<TargetRow, 'effectiveFrom'> }>(
  rows: readonly T[],
  dates: readonly string[],
): (T | null)[] {
  return dates.map((date) => rows.find((row) => row.target.effectiveFrom <= date) ?? null);
}

export async function getTargetForDate(
  db: Db,
  userId: string,
  date: string,
): Promise<Target | null> {
  const row = await selectTargetForDate(db, userId, date);
  return row ? serializeTarget(row.target) : null;
}
