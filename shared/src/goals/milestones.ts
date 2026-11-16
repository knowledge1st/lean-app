import { DAYS_PER_WEEK, WEIGHT_DECIMAL_FACTOR } from './constants';
import { addDays, daysBetween } from './dates';
import type { Milestone } from './types';

export function buildMilestones(args: {
  startDate: string;
  startWeightKg: number;
  targetWeightKg: number;
  endDate: string;
}): Milestone[] {
  const { startDate, startWeightKg, targetWeightKg, endDate } = args;
  const totalDays = daysBetween(startDate, endDate);
  if (totalDays <= 0) return [];
  const milestones: Milestone[] = [];
  for (let days = DAYS_PER_WEEK; days < totalDays; days += DAYS_PER_WEEK) {
    const weight = startWeightKg + ((targetWeightKg - startWeightKg) * days) / totalDays;
    milestones.push({
      date: addDays(startDate, days),
      expectedWeightKg: Math.round(weight * WEIGHT_DECIMAL_FACTOR) / WEIGHT_DECIMAL_FACTOR,
      kind: 'week',
    });
  }
  for (const [index, milestone] of milestones.entries()) {
    if (milestone.date.slice(0, 7) !== milestones[index + 1]?.date.slice(0, 7)) {
      milestone.kind = 'month';
    }
  }
  milestones.push({
    date: endDate,
    expectedWeightKg: Math.round(targetWeightKg * WEIGHT_DECIMAL_FACTOR) / WEIGHT_DECIMAL_FACTOR,
    kind: 'final',
  });
  return milestones;
}
