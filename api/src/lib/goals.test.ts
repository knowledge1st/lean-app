import { buildMilestones, buildPlan, type Plan } from '@lean/shared';
import { describe, expect, it } from 'vitest';
import { deriveMilestoneKinds, interpolateWeight, limitAdjustedTargetDate } from './goals';

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

describe('persisted milestones', () => {
  it.each([
    ['2026-11-16', '2026-11-17'],
    ['2026-11-16', '2026-11-23'],
    ['2026-11-16', '2026-11-30'],
    ['2026-11-16', '2027-03-01'],
    ['2026-12-20', '2027-02-03'],
    ['2024-02-01', '2024-03-10'],
    ['2026-11-16', '2026-11-16'],
  ])('reconstructs engine kinds from %s to %s', (startDate, endDate) => {
    const points = buildMilestones({ startDate, endDate, startWeightKg: 100, targetWeightKg: 80 });
    expect(
      deriveMilestoneKinds(
        points.map(({ date, expectedWeightKg }) => ({ date, expectedWeightKg })),
      ),
    ).toEqual(points);
  });
  it('interpolates and clamps the weight curve', () => {
    const points = [
      { date: '2026-11-23', expectedWeightKg: 99 },
      { date: '2026-11-30', expectedWeightKg: 98 },
    ];
    expect(interpolateWeight('2026-11-16', 100, [], '2026-11-22')).toBeNull();
    expect(interpolateWeight('2026-11-16', 100, points, '2026-11-15')).toBe(100);
    expect(interpolateWeight('2026-11-16', 100, points, '2026-11-16')).toBe(100);
    expect(interpolateWeight('2026-11-16', 100, points, '2026-11-22')).toBe(99.1);
    expect(interpolateWeight('2026-11-16', 100, points, '2026-11-23')).toBe(99);
    expect(interpolateWeight('2026-11-16', 100, points, '2027-01-01')).toBe(98);
  });
});
