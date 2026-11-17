import { checkinSchema, pendingCheckinResponseSchema } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { expect, vi } from 'vitest';
import { buildDemoData } from '../../scripts/seed-demo';
import { bodyLogs, mealEntries, targets } from '../../src/db/schema';
import { goalsFixture, manualGoal } from './goals';

export function checkinsFixture() {
  const f = goalsFixture();
  return {
    ...f,
    async started(mode: 'weight' | 'manual' = 'weight', user = 0) {
      vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
      if (mode === 'weight') await f.profile(user);
      const saved = await f.create(
        mode === 'weight'
          ? {
              weightKg: 100,
              goal: { mode: 'weight_date', targetWeightKg: 90, targetDate: '2027-02-01' },
            }
          : manualGoal,
        user,
      );
      vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
      return saved;
    },
    async data(
      goalId: string,
      scenario: 'adjust' | 'on_track' | 'insufficient' = 'adjust',
      user = 0,
    ) {
      const userId = f.accounts[user]!.user.id;
      const [target] = await f.db.select().from(targets).where(eq(targets.goalId, goalId));
      const food = await f.food(user);
      const data = buildDemoData({
        today: '2026-11-16',
        scenario,
        weightKg: 100,
        kcal: target!.kcal,
        expectedWeeklyChangeKg: (-10 * 7) / 105,
        food: { kcal: 200, protein: 10.25, carbs: 20.5, fat: 3.15 },
      });
      await f.db
        .insert(bodyLogs)
        .values(
          data.weights.map((row) => ({ userId, date: row.date, weightKg: String(row.weightKg) })),
        );
      await f.db.insert(mealEntries).values(
        data.meals.map((row) => ({
          userId,
          foodId: food.id!,
          date: row.date,
          meal: 'lunch' as const,
          status: 'eaten' as const,
          grams: String(row.grams),
          kcal: String(row.kcal),
          protein: String(row.protein),
          carbs: String(row.carbs),
          fat: String(row.fat),
        })),
      );
      return data;
    },
    async pending(user = 0) {
      const response = await f.request('/checkins/pending', 'GET', undefined, user);
      expect(response.status).toBe(200);
      const result = pendingCheckinResponseSchema.parse(await response.json());
      if (result.checkin) checkinSchema.parse(result.checkin);
      return result.checkin;
    },
  };
}
