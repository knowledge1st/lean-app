import type { WeekSummary } from '@lean/shared';
import { addDays } from '../../lib/date';
import type { ProgressLog } from './calc';
export const log = (
  date: string,
  weightKg: number | null,
  trendWeightKg: number | null = weightKg,
): ProgressLog => ({
  date,
  weightKg,
  trendWeightKg,
  bodyFatPct: null,
  waistCm: null,
  hipCm: null,
  chestCm: null,
  armCm: null,
  thighCm: null,
});
export const weekSummary: WeekSummary = {
  week: '2026-W02',
  from: '2026-01-05',
  to: '2026-01-11',
  days: Array.from({ length: 7 }, (_, i) => ({
    date: addDays('2026-01-05', i),
    eatenKcal: i === 0 ? 2100 : 0,
    targetKcal: i === 1 ? null : 2000,
  })),
  eatenKcal: 2100,
  budgetKcal: null,
  remainingKcal: null,
  loggedDays: 1,
  expectedWeightKg: null,
};
