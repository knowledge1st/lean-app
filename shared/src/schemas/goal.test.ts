import { describe, expect, it } from 'vitest';
import { buildPlan } from '../goals';
import {
  createGoalSchema,
  goalInputSchema,
  isoWeekRange,
  isoWeekSchema,
  planSchema,
  summaryWeekQuerySchema,
  targetsQuerySchema,
} from './goal';

const manual = { mode: 'manual', kcal: 2000, proteinG: 120.5, carbsG: 250, fatG: 60 };
describe('goal schemas', () => {
  it.each([
    manual,
    { mode: 'weight_date', targetWeightKg: 20, targetDate: '2027-01-01' },
    { mode: 'composition', preset: 'cut' },
    { mode: 'composition', preset: 'recomp' },
    { mode: 'composition', preset: 'lean_bulk' },
  ])('accepts goal %j', (goal) => {
    expect(createGoalSchema.safeParse({ goal, weightKg: 400, bodyFatPct: 75 }).success).toBe(true);
  });
  it.each([
    { kcal: 499 },
    { kcal: 10001 },
    { kcal: 2000.1 },
    { proteinG: -0.1 },
    { carbsG: 1000.1 },
    { fatG: 50.01 },
    { mode: 'target_weight' },
    { extra: 1 },
  ])('rejects invalid manual goal %j', (patch) => {
    expect(goalInputSchema.safeParse({ ...manual, ...patch }).success).toBe(false);
  });
  it.each([
    { weightKg: 19.9 },
    { weightKg: 400.1 },
    { weightKg: 80.01 },
    { weightKg: '80' },
    { bodyFatPct: 1.9 },
    { bodyFatPct: 75.1 },
    { bodyFatPct: 20.01 },
    { extra: 1 },
    { goal: { mode: 'weight_date', targetWeightKg: 80.01, targetDate: '2027-01-01' } },
    { goal: { mode: 'weight_date', targetWeightKg: 80, targetDate: '2027-02-30' } },
    { goal: { mode: 'composition', preset: 'invalid' } },
  ])('rejects invalid creation %j', (patch) => {
    expect(createGoalSchema.safeParse({ goal: manual, weightKg: 80, ...patch }).success).toBe(
      false,
    );
  });
  it('accepts decimal and range boundaries', () => {
    expect(
      createGoalSchema.safeParse({
        goal: { ...manual, kcal: 500, proteinG: 0, carbsG: 1000, fatG: 0.1 },
        weightKg: 20,
        bodyFatPct: 2,
      }).success,
    ).toBe(true);
    expect(goalInputSchema.safeParse({ ...manual, kcal: 10000 }).success).toBe(true);
    expect(targetsQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
  });
  it('validates the engine response including adjustments', () => {
    const plan = buildPlan(
      { sex: 'male', birthDate: '1990-01-01', heightCm: 180, activity: 'moderate' },
      { weightKg: 100 },
      { mode: 'weight_date', targetWeightKg: 80, targetDate: '2026-11-30' },
      '2026-11-16',
    );
    expect(plan.adjusted).toBeDefined();
    expect(planSchema.parse(plan)).toEqual(plan);
  });
});
describe('ISO weeks', () => {
  it.each(['2026-W47', '2020-W53', '1900-W01', '2100-W51'])('accepts %s', (week) => {
    expect(isoWeekSchema.parse(week)).toBe(week);
  });
  it.each([
    '2100-W52',
    '2021-W53',
    '2026-W00',
    '2026-W54',
    '1899-W01',
    '2101-W01',
    '2026-W1',
    '2026-w47',
    '',
  ])('rejects %s', (week) => {
    expect(summaryWeekQuerySchema.safeParse({ week }).success).toBe(false);
  });
  it.each([
    ['2026-W47', '2026-11-16', '2026-11-22'],
    ['2020-W53', '2020-12-28', '2021-01-03'],
    ['2025-W01', '2024-12-30', '2025-01-05'],
    ['1900-W01', '1900-01-01', '1900-01-07'],
    ['2100-W51', '2100-12-20', '2100-12-26'],
  ])('calculates %s', (week, from, to) => {
    expect(isoWeekRange(week)).toEqual({ from, to });
  });
  it('rejects an invalid range request', () => expect(() => isoWeekRange('2021-W53')).toThrow());
});
