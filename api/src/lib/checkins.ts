import {
  computeTrend,
  expectedWeeklyChangeForWeightGoal,
  type Checkin,
  type CheckinGoal,
} from '@lean/shared';
import type { Checkin as CheckinRow, Goal } from '../db/schema';

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
}
export function checkinWindow(today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(today, -((weekday + 6) % 7) - 7);
  return { weekStart, weekEnd: addDays(weekStart, 6), from: addDays(weekStart, -7) };
}
export function checkinGoal(goal: Goal, startDate: string, endDate: string): CheckinGoal {
  if (goal.mode === 'manual') return { mode: 'manual' };
  if (goal.mode === 'body_composition') return { mode: 'composition', preset: goal.preset! };
  return {
    mode: 'weight_date',
    expectedWeeklyChangeKg: expectedWeeklyChangeForWeightGoal({
      startWeightKg: Number(goal.startWeightKg),
      targetWeightKg: Number(goal.targetWeightKg),
      startDate,
      endDate,
    }),
  };
}
export function checkinDays(
  from: string,
  to: string,
  weights: { date: string; weightKg: string | null }[],
  intake: { date: string; kcal: number }[],
) {
  const weightByDate = new Map(
    weights.map((row) => [row.date, row.weightKg === null ? null : Number(row.weightKg)]),
  );
  const intakeByDate = new Map(intake.map((row) => [row.date, row.kcal]));
  const start = addDays(from, -60);
  const points = Array.from(
    { length: Math.round((Date.parse(to) - Date.parse(start)) / 86400000) + 1 },
    (_, index) => {
      const date = addDays(start, index);
      return { date, weightKg: weightByDate.get(date) ?? null };
    },
  );
  return computeTrend(points)
    .filter((day) => day.date >= from)
    .map((day) => ({ ...day, kcalEaten: intakeByDate.get(day.date) ?? null }));
}
const numeric = (value: string | null) => (value === null ? null : Number(value));
export function serializeCheckin(row: CheckinRow): Checkin {
  return {
    id: row.id,
    goalId: row.goalId,
    weekStart: row.weekStart,
    weekEnd: addDays(row.weekStart, 6),
    status: row.status,
    loggedDays: row.loggedDays,
    weighIns: row.weighIns,
    avgIntakeKcal: row.avgIntakeKcal,
    estimatedTdee: row.estimatedTdee,
    trendWeightKg: numeric(row.trendWeightKg),
    actualWeeklyChangeKg: numeric(row.actualWeeklyChangeKg),
    expectedWeeklyChangeKg: numeric(row.expectedWeeklyChangeKg),
    current: {
      kcal: row.currentKcal,
      proteinG: Number(row.currentProteinG),
      carbsG: Number(row.currentCarbsG),
      fatG: Number(row.currentFatG),
    },
    proposed:
      row.status === 'adjust'
        ? {
            kcal: row.proposedKcal!,
            proteinG: Number(row.proposedProteinG),
            carbsG: Number(row.proposedCarbsG),
            fatG: Number(row.proposedFatG),
          }
        : null,
    deltaKcal: row.deltaKcal,
    reason: row.reason,
    accepted: row.accepted,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
