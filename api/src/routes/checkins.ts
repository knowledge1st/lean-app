import { checkinsQuerySchema, evaluateCheckin, resolveCheckinSchema } from '@lean/shared';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { bodyLogs, checkins as table, goals, mealEntries } from '../db/schema';
import type { AppEnv } from '../env';
import {
  addDays,
  checkinDays,
  checkinGoal,
  checkinWindow,
  serializeCheckin,
} from '../lib/checkins';
import { AppError } from '../lib/errors';
import { firstTarget, selectMilestones } from '../lib/goals';
import { selectTargetForDate } from '../lib/targets';
import { today } from '../lib/today';
import { validate } from '../lib/validate';
import { selectProfile } from './profile';

export const checkins = new Hono<AppEnv>();
const notFound = () => new AppError(404, 'checkin_not_found', 'Revisión no encontrada');
const resolved = () =>
  new AppError(409, 'checkin_already_resolved', 'Esta revisión ya se resolvió');
checkins.get('/pending', async (c) => {
  const db = getDb(c.env),
    userId = c.get('userId');
  const [[goal], profile] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, 'active'))),
    selectProfile(db, userId),
  ]);
  if (!goal) return c.json({ checkin: null });
  const date = today(profile?.timeZone);
  const { weekStart, weekEnd, from } = checkinWindow(date);
  const condition = and(eq(table.goalId, goal.id), eq(table.weekStart, weekStart));
  const [initial, [existing], current] = await Promise.all([
    firstTarget(db, userId, goal.id),
    db.select().from(table).where(condition),
    selectTargetForDate(db, userId, date),
  ]);
  if (initial.effectiveFrom > weekEnd) return c.json({ checkin: null });
  if (existing) return c.json({ checkin: existing.resolvedAt ? null : serializeCheckin(existing) });
  if (!current) return c.json({ checkin: null });
  const [weights, intake, points] = await Promise.all([
    db
      .select({ date: bodyLogs.date, weightKg: bodyLogs.weightKg })
      .from(bodyLogs)
      .where(
        and(
          eq(bodyLogs.userId, userId),
          gte(bodyLogs.date, addDays(from, -60)),
          lte(bodyLogs.date, weekEnd),
        ),
      ),
    db
      .select({
        date: mealEntries.date,
        kcal: sql<number>`round(sum(${mealEntries.kcal}))`.mapWith(Number),
      })
      .from(mealEntries)
      .where(
        and(
          eq(mealEntries.userId, userId),
          eq(mealEntries.status, 'eaten'),
          gte(mealEntries.date, from),
          lte(mealEntries.date, weekEnd),
        ),
      )
      .groupBy(mealEntries.date),
    selectMilestones(db, userId, goal.id),
  ]);
  const days = checkinDays(from, weekEnd, weights, intake);
  const trend = days.at(-1)!.trendWeightKg;
  const target = current.target;
  const result = evaluateCheckin({
    days,
    currentTarget: {
      kcal: target.kcal,
      proteinG: Number(target.proteinG),
      carbsG: Number(target.carbsG),
      fatG: Number(target.fatG),
    },
    goal: checkinGoal(goal, initial.effectiveFrom, points.at(-1)?.date ?? initial.effectiveFrom),
    profile: { sex: profile?.sex ?? 'female' },
    weightKg: trend ?? Number(goal.startWeightKg),
  });
  await db
    .insert(table)
    .values({
      goalId: goal.id,
      weekStart,
      status: result.status,
      loggedDays: result.loggedDays,
      weighIns: result.weighIns,
      trendWeightKg: trend === null ? null : String(trend),
      currentKcal: target.kcal,
      currentProteinG: target.proteinG,
      currentCarbsG: target.carbsG,
      currentFatG: target.fatG,
      ...(result.status === 'insufficient_data'
        ? {}
        : {
            avgIntakeKcal: result.avgIntakeKcal,
            estimatedTdee: result.estimatedTdee,
            actualWeeklyChangeKg: String(result.actualWeeklyChangeKg),
            expectedWeeklyChangeKg:
              result.expectedWeeklyChangeKg === null ? null : String(result.expectedWeeklyChangeKg),
          }),
      ...(result.status === 'adjust'
        ? {
            proposedKcal: result.proposed.kcal,
            proposedProteinG: String(result.proposed.proteinG),
            proposedCarbsG: String(result.proposed.carbsG),
            proposedFatG: String(result.proposed.fatG),
            deltaKcal: result.deltaKcal,
            reason: result.reason,
          }
        : {}),
    })
    .onConflictDoNothing({ target: [table.goalId, table.weekStart] });
  const [saved] = await db.select().from(table).where(condition);
  if (!saved) throw new Error('No se pudo guardar la revisión');
  return c.json({ checkin: saved.resolvedAt ? null : serializeCheckin(saved) });
});
checkins.post('/:id/resolve', validate('json', resolveCheckinSchema), async (c) => {
  const id = c.req.param('id');
  if (!z.uuid().safeParse(id).success) throw notFound();
  const db = getDb(c.env),
    userId = c.get('userId');
  const owned = and(eq(table.id, id), eq(goals.userId, userId));
  const [found] = await db
    .select({ checkin: table, goal: goals })
    .from(table)
    .innerJoin(goals, eq(table.goalId, goals.id))
    .where(owned);
  if (!found) throw notFound();
  if (found.checkin.resolvedAt) throw resolved();
  const { accept } = c.req.valid('json');
  if (accept && found.checkin.status === 'adjust') {
    const profile = await selectProfile(db, userId);
    const date = today(profile?.timeZone);
    // Share the goal-creation lock so archiving cannot race an accepted adjustment.
    const [, inserted] = await db.batch([
      db.execute(sql`SELECT pg_advisory_xact_lock(3, hashtext(${userId}))`),
      db.execute(sql`WITH upd AS (
        UPDATE checkins c SET accepted = true, resolved_at = now(), target_id = gen_random_uuid()
        FROM goals g WHERE c.id = ${id}::uuid AND c.goal_id = g.id
          AND g.user_id = ${userId}::uuid AND g.status = 'active' AND c.resolved_at IS NULL
        RETURNING c.*
      ) INSERT INTO targets (id, goal_id, effective_from, kcal, protein_g, carbs_g, fat_g, water_ml, reason)
        SELECT upd.target_id, upd.goal_id, ${date}::date, upd.proposed_kcal,
          upd.proposed_protein_g, upd.proposed_carbs_g, upd.proposed_fat_g,
          (SELECT t.water_ml FROM targets t JOIN goals g ON t.goal_id = g.id
           WHERE g.user_id = ${userId}::uuid AND t.effective_from <= ${date}::date
           ORDER BY t.effective_from DESC, t.created_at DESC, t.id DESC LIMIT 1), 'adjustment'
        FROM upd RETURNING id`),
    ]);
    if (!inserted.rows.length) {
      const [latest] = await db
        .select({ resolvedAt: table.resolvedAt })
        .from(table)
        .innerJoin(goals, eq(table.goalId, goals.id))
        .where(owned);
      if (latest?.resolvedAt) throw resolved();
      throw new AppError(409, 'goal_not_active', 'El objetivo ya no está activo');
    }
  } else {
    const [updated] = await db
      .update(table)
      .set({ accepted: accept, resolvedAt: sql`now()` })
      .where(and(eq(table.id, id), eq(table.goalId, found.goal.id), isNull(table.resolvedAt)))
      .returning();
    if (!updated) throw resolved();
    return c.json(serializeCheckin(updated));
  }
  const [saved] = await db
    .select({ checkin: table })
    .from(table)
    .innerJoin(goals, eq(table.goalId, goals.id))
    .where(owned);
  if (!saved) throw notFound();
  return c.json(serializeCheckin(saved.checkin));
});
checkins.get('/', validate('query', checkinsQuerySchema), async (c) => {
  const rows = await getDb(c.env)
    .select({ checkin: table })
    .from(table)
    .innerJoin(goals, eq(table.goalId, goals.id))
    .where(eq(goals.userId, c.get('userId')))
    .orderBy(desc(table.weekStart), desc(table.createdAt))
    .limit(c.req.valid('query').limit);
  return c.json({ checkins: rows.map((row) => serializeCheckin(row.checkin)) });
});
