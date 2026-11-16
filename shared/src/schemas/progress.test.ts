import { describe, expect, it } from 'vitest';
import {
  addWaterSchema,
  createExerciseSchema,
  progressRangeSchema,
  putBodyLogSchema,
  updateExerciseSchema,
} from './progress';

describe('progress schemas', () => {
  const fields = [
    ['weightKg', 25, 300],
    ['bodyFatPct', 3, 60],
    ['waistCm', 20, 250],
    ['hipCm', 20, 250],
    ['chestCm', 20, 250],
    ['armCm', 20, 250],
    ['thighCm', 20, 250],
  ] as const;
  it.each(fields)('validates finite inclusive %s bounds', (field, min, max) => {
    for (const value of [min, max])
      expect(putBodyLogSchema.safeParse({ [field]: value }).success).toBe(true);
    for (const value of [min - 0.1, max + 0.1, null, NaN, Infinity, -Infinity, '80'])
      expect(putBodyLogSchema.safeParse({ [field]: value }).success).toBe(false);
  });
  it('requires fields and rejects unknown keys', () => {
    for (const input of [{}, { weightKg: undefined }, { userId: 'abc', weightKg: 80 }])
      expect(putBodyLogSchema.safeParse(input).success).toBe(false);
    expect(updateExerciseSchema.safeParse({}).success).toBe(false);
    expect(updateExerciseSchema.safeParse({ userId: 'abc' }).success).toBe(false);
  });
  it('validates 366 inclusive days, ordering, missing dates and real dates', () => {
    expect(progressRangeSchema.safeParse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(
      true,
    );
    for (const input of [
      { from: '2024-01-01', to: '2025-01-01' },
      { from: '2026-11-02', to: '2026-11-01' },
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-11-01' },
      {},
    ])
      expect(progressRangeSchema.safeParse(input).success).toBe(false);
  });
  it.each([0, 10001, -10001, 1.5, null, Infinity])('rejects water %s', (ml) => {
    expect(addWaterSchema.safeParse({ date: '2026-11-14', ml }).success).toBe(false);
  });
  it('accepts water bounds, trims activity and defaults kcal only on create', () => {
    for (const ml of [-10000, 10000])
      expect(addWaterSchema.parse({ date: '2026-11-14', ml }).ml).toBe(ml);
    expect(
      createExerciseSchema.parse({ date: '2026-11-14', activity: '  Caminar  ', minutes: 1 }),
    ).toEqual({ date: '2026-11-14', activity: 'Caminar', minutes: 1, kcal: 0 });
    expect(updateExerciseSchema.parse({ minutes: 600 })).toEqual({ minutes: 600 });
  });
  it.each([
    { minutes: 0 },
    { minutes: 601 },
    { minutes: 1.5 },
    { kcal: -1 },
    { kcal: 3001 },
    { kcal: null },
    { activity: '  ' },
    { activity: 'a'.repeat(101) },
    { userId: 'abc' },
  ])('rejects exercise %j', (patch) => {
    expect(
      createExerciseSchema.safeParse({
        date: '2026-11-14',
        activity: 'Caminar',
        minutes: 30,
        ...patch,
      }).success,
    ).toBe(false);
  });
});
