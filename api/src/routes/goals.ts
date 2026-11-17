import {
  buildPlan,
  createGoalSchema,
  rebalanceMacrosForKcal,
  targetsQuerySchema,
  updateTargetKcalSchema,
  type Profile,
} from '@lean/shared';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { bodyLogs, goals as table, milestones, targets as targetTable } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { limitAdjustedTargetDate, maxGoalTargetDate, serializeGoal } from '../lib/goals';
import { getTargetForDate, selectTargetForDate } from '../lib/targets';
import { today as localToday } from '../lib/today';
import { validate } from '../lib/validate';
import { selectProfile, serializeProfile } from './profile';

// Manual plans never read profile fields. This fallback lets users start without a profile.
const manualProfile: Profile = {
  sex: 'female',
  birthDate: '1990-01-01',
  heightCm: 170,
  activity: 'sedentary',
};
function isGoalConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    code?: string;
    constraint?: string;
    constraint_name?: string;
    cause?: unknown;
  };
  return (
    (record.code === '23505' &&
      (record.constraint === 'goals_one_active_idx' ||
        record.constraint_name === 'goals_one_active_idx')) ||
    isGoalConflict(record.cause)
  );
}
export const goals = new Hono<AppEnv>();
goals.get('/active', async (c) => {
  const db = getDb(c.env),
    userId = c.get('userId');
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.status, 'active')));
  if (!row) throw new AppError(404, 'goal_not_found', 'Objetivo no encontrado');
  const profile = await selectProfile(db, userId);
  return c.json(await serializeGoal(db, userId, row, localToday(profile?.timeZone)));
});
// Lets the user override the generated daily calories. Protein and fat stay, carbs absorb
// the difference, and the new target applies from today on without touching past days.
goals.put('/active/target', validate('json', updateTargetKcalSchema), async (c) => {
  const { kcal } = c.req.valid('json');
  const db = getDb(c.env),
    userId = c.get('userId');
  const profile = await selectProfile(db, userId);
  const today = localToday(profile?.timeZone);
  const [goal] = await db
    .select()
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.status, 'active')));
  if (!goal) throw new AppError(404, 'goal_not_found', 'Objetivo no encontrado');
  const current = await selectTargetForDate(db, userId, today);
  const base = current?.target;
  const macros = rebalanceMacrosForKcal(kcal, {
    proteinG: Number(base?.proteinG ?? 0),
    fatG: Number(base?.fatG ?? 0),
  });
  const waterMl = base?.waterMl ?? 0;
  // Share the goal-creation lock and insert only while the goal is still active.
  const [, inserted] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(3, hashtext(${userId}))`),
    db.execute(sql`INSERT INTO targets (goal_id, effective_from, kcal, protein_g, carbs_g, fat_g, water_ml, reason)
      SELECT g.id, ${today}::date, ${kcal}, ${String(macros.proteinG)}::numeric,
        ${String(macros.carbsG)}::numeric, ${String(macros.fatG)}::numeric, ${waterMl}, 'manual'
      FROM goals g WHERE g.id = ${goal.id}::uuid AND g.user_id = ${userId}::uuid AND g.status = 'active'
      RETURNING id`),
  ]);
  if (!inserted.rows.length)
    throw new AppError(409, 'goal_not_active', 'El objetivo ya no está activo');
  return c.json(await serializeGoal(db, userId, goal, today));
});
for (const path of ['/preview', '/'] as const) {
  goals.post(path, validate('json', createGoalSchema), async (c) => {
    const input = c.req.valid('json'),
      db = getDb(c.env),
      userId = c.get('userId');
    const row = await selectProfile(db, userId);
    const profile = serializeProfile(row);
    const today = localToday(row?.timeZone);
    if (input.goal.mode !== 'manual' && !profile)
      throw new AppError(409, 'profile_required', 'Completá tu perfil para crear este objetivo');
    if (input.goal.mode === 'weight_date' && input.goal.targetDate > maxGoalTargetDate(today))
      throw new AppError(
        400,
        'validation_error',
        'goal.targetDate: La fecha no puede superar cinco años desde hoy',
      );
    const plan = limitAdjustedTargetDate(
      buildPlan(
        profile ? { ...profile, activity: profile.activityLevel } : manualProfile,
        {
          weightKg: input.weightKg,
          ...(input.bodyFatPct === undefined ? {} : { bodyFatPct: input.bodyFatPct }),
        },
        input.goal,
        today,
      ),
      today,
    );
    if (path === '/preview') return c.json(plan);
    const goalId = crypto.randomUUID(),
      targetId = crypto.randomUUID();
    const milestoneRows = plan.milestones.map((point) => ({
      id: crypto.randomUUID(),
      goalId,
      date: point.date,
      expectedWeightKg: String(point.expectedWeightKg),
    }));
    const body = {
      weightKg: String(input.weightKg),
      ...(input.bodyFatPct === undefined ? {} : { bodyFatPct: String(input.bodyFatPct) }),
    };
    const goal = {
      id: goalId,
      userId,
      mode:
        input.goal.mode === 'weight_date'
          ? ('target_weight' as const)
          : input.goal.mode === 'composition'
            ? ('body_composition' as const)
            : ('manual' as const),
      startWeightKg: String(input.weightKg),
      targetWeightKg: input.goal.mode === 'weight_date' ? String(input.goal.targetWeightKg) : null,
      targetDate:
        input.goal.mode === 'weight_date'
          ? (plan.adjusted?.targetDate ?? input.goal.targetDate)
          : null,
      preset: input.goal.mode === 'composition' ? input.goal.preset : null,
    };
    try {
      const [, , inserted] = await db.batch([
        db.execute(sql`SELECT pg_advisory_xact_lock(3, hashtext(${userId}))`),
        db
          .update(table)
          .set({ status: 'archived', updatedAt: sql`now()` })
          .where(and(eq(table.userId, userId), eq(table.status, 'active'))),
        db.insert(table).values(goal).returning(),
        db.insert(targetTable).values({
          id: targetId,
          goalId,
          effectiveFrom: today,
          ...plan.daily,
          proteinG: String(plan.daily.proteinG),
          carbsG: String(plan.daily.carbsG),
          fatG: String(plan.daily.fatG),
          reason: 'initial',
        }),
        ...(milestoneRows.length ? [db.insert(milestones).values(milestoneRows)] : []),
        db
          .insert(bodyLogs)
          .values({ id: crypto.randomUUID(), userId, date: today, ...body })
          .onConflictDoUpdate({
            target: [bodyLogs.userId, bodyLogs.date],
            set: { ...body, updatedAt: sql`now()` },
          }),
      ]);
      const saved = inserted[0];
      if (!saved) throw new Error('No se pudo guardar el objetivo');
      return c.json({ goal: await serializeGoal(db, userId, saved, today), plan }, 201);
    } catch (error) {
      if (isGoalConflict(error))
        throw new AppError(
          409,
          'goal_conflict',
          'Ya existe un objetivo activo. Volvé a intentarlo',
        );
      throw error;
    }
  });
}
export const targets = new Hono<AppEnv>();
targets.get('/', validate('query', targetsQuerySchema), async (c) =>
  c.json(await getTargetForDate(getDb(c.env), c.get('userId'), c.req.valid('query').date)),
);
