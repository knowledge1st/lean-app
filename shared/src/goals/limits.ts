import type { Plan } from './types';

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
