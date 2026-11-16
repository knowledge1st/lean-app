import { expect, it } from 'vitest';
import { buildPlan } from './buildPlan';
import type { ActivityLevel, Body, CompositionPreset, GoalInput, Profile } from './types';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

it('satisfies calorie and macro invariants for 100 reproducible valid inputs', () => {
  const random = mulberry32(0x0502026);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const activities: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active'];
  const presets: CompositionPreset[] = ['cut', 'recomp', 'lean_bulk'];
  const modes = new Set<string>();
  for (let index = 0; index < 100; index++) {
    const age = integer(18, 80);
    const profile: Profile = {
      sex: random() < 0.5 ? 'female' : 'male',
      birthDate: `${2026 - age}-01-05`,
      heightCm: integer(150, 200),
      activity: activities[integer(0, activities.length - 1)]!,
    };
    const body: Body = {
      weightKg: integer(450, 1500) / 10,
      ...(random() < 0.5 ? { bodyFatPct: integer(100, 400) / 10 } : {}),
    };
    const days = integer(7, 365);
    const targetDate = new Date(Date.UTC(2026, 0, 5 + days)).toISOString().slice(0, 10);
    const delta = (random() < 0.5 ? -1 : 1) * (integer(0, 200) / 10);
    const goal: GoalInput =
      index % 2 === 0
        ? { mode: 'weight_date', targetWeightKg: body.weightKg + delta, targetDate }
        : { mode: 'composition', preset: presets[integer(0, presets.length - 1)]! };
    modes.add(goal.mode);
    // Each macro is rounded within .5 g: maximum energy error = .5·(4+4+9) = 8.5 kcal.
    // The lowest allowed floor is 1200; 8.5/1200 = .7083%, comfortably below 5%.
    const result = buildPlan(profile, body, goal, '2026-01-05');
    const { kcal, proteinG, carbsG, fatG } = result.daily;
    const macroKcal = 4 * proteinG + 4 * carbsG + 9 * fatG;
    expect(Math.abs(macroKcal - kcal), `input ${index}`).toBeLessThanOrEqual(kcal * 0.05);
    expect(kcal).toBeGreaterThanOrEqual(profile.sex === 'female' ? 1200 : 1500);
    expect(carbsG).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(kcal)).toBe(true);
    expect(kcal % 10).toBe(0);
    expect(result.weekly.kcalBudget).toBe(kcal * 7);
    expect(new Set(result.warnings.map(({ code }) => code)).size).toBe(result.warnings.length);
    if (result.adjusted) expect(result.adjusted.targetDate > '2026-01-05').toBe(true);
  }
  expect(modes).toEqual(new Set(['weight_date', 'composition']));
});
