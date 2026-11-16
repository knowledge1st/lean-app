import { buildPlan } from './buildPlan';
import type { Plan } from './types';
import { limitAdjustedTargetDate, maxGoalTargetDate } from './limits';
import { describe, expect, it } from 'vitest';

describe('adjusted target date limit', () => {
  const today = '2026-11-16';
  const plan: Plan = {
    ...buildPlan(
      { sex: 'male', birthDate: '1990-01-01', heightCm: 180, activity: 'moderate' },
      { weightKg: 100 },
      { mode: 'weight_date', targetWeightKg: 90, targetDate: '2027-05-01' },
      today,
    ),
    warnings: [{ code: 'floor_applied' }, { code: 'rate_capped' }],
  };

  it('preserves a plan adjusted to exactly five years from today', () => {
    const boundary = { ...plan, adjusted: { targetDate: '2031-11-16' } };
    expect(limitAdjustedTargetDate(boundary, today)).toBe(boundary);
  });

  it('marks a plan adjusted one day beyond five years as unreachable without mutating it', () => {
    const beyond = { ...plan, adjusted: { targetDate: '2031-11-17' } };
    const original = structuredClone(beyond);
    const result = limitAdjustedTargetDate(beyond, today);
    expect(result).not.toHaveProperty('adjusted');
    expect(result.milestones).toEqual([]);
    expect(result.warnings).toEqual([...plan.warnings, { code: 'date_unreachable' }]);
    expect(result.daily).toBe(beyond.daily);
    expect(result.weekly).toBe(beyond.weekly);
    expect(result.tdee).toBe(beyond.tdee);
    expect(beyond).toEqual(original);
  });

  it('preserves a plan without an adjusted date', () => {
    expect(plan).not.toHaveProperty('adjusted');
    expect(limitAdjustedTargetDate(plan, today)).toBe(plan);
  });

  it('preserves existing warnings without duplicating date_unreachable', () => {
    const unreachable: Plan = {
      ...plan,
      adjusted: { targetDate: '2307-12-21' },
      warnings: [...plan.warnings, { code: 'date_unreachable' }],
    };
    const result = limitAdjustedTargetDate(unreachable, today);
    expect(result.warnings).toEqual(unreachable.warnings);
    expect(result).not.toHaveProperty('adjusted');
    expect(result.milestones).toEqual([]);
  });
});

it('uses the same calendar rollover for leap days', () => {
  expect(maxGoalTargetDate('2024-02-29')).toBe('2029-03-01');
  expect(maxGoalTargetDate('2026-11-16')).toBe('2031-11-16');
});
