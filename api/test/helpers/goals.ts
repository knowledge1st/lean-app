import { activeGoalSchema, planSchema } from '@lean/shared';
import { eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { bodyLogs, goals, milestones, profiles, targets } from '../../src/db/schema';
import { diaryFixture } from './diary';

export const completeProfile = {
  sex: 'male',
  birthDate: '1990-01-01',
  heightCm: 180,
  activityLevel: 'moderate',
  timeZone: 'America/Argentina/Buenos_Aires',
};
export const manualGoal = {
  goal: { mode: 'manual', kcal: 2000, proteinG: 150, carbsG: 200, fatG: 66 },
  weightKg: 100,
};
export const weightGoal = {
  goal: { mode: 'weight_date', targetWeightKg: 90, targetDate: '2027-05-01' },
  weightKg: 100,
};
export function goalsFixture() {
  const f = diaryFixture();
  return {
    ...f,
    async profile(user = 0) {
      const response = await f.request('/profile', 'PUT', completeProfile, user);
      expect(response.status).toBe(200);
    },
    async create(input: unknown = manualGoal, user = 0) {
      const response = await f.request('/goals', 'POST', input, user);
      expect(response.status).toBe(201);
      const json = (await response.json()) as { goal: unknown; plan: unknown };
      return { goal: activeGoalSchema.parse(json.goal), plan: planSchema.parse(json.plan) };
    },
    async counts(user = 0) {
      const userId = f.accounts[user]!.user.id;
      const count = { count: sql<number>`count(*)`.mapWith(Number) };
      const rows = await Promise.all([
        f.db.select(count).from(goals).where(eq(goals.userId, userId)),
        f.db
          .select(count)
          .from(targets)
          .innerJoin(goals, eq(targets.goalId, goals.id))
          .where(eq(goals.userId, userId)),
        f.db
          .select(count)
          .from(milestones)
          .innerJoin(goals, eq(milestones.goalId, goals.id))
          .where(eq(goals.userId, userId)),
        f.db.select(count).from(bodyLogs).where(eq(bodyLogs.userId, userId)),
        f.db.select(count).from(profiles).where(eq(profiles.userId, userId)),
      ]);
      return rows.map((result) => result[0]!.count);
    },
  };
}
