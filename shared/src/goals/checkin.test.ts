import { describe, expect, it } from 'vitest';
import { evaluateCheckin, expectedWeeklyChangeForWeightGoal } from './checkin';
import type { CheckinDay, CheckinInput, CheckinResult } from './checkin';
import { addDays } from './dates';

function linearDays(start: string, intake: number, weeklyChange: number): CheckinDay[] {
  return Array.from({ length: 14 }, (_, index) => ({
    date: addDays(start, index),
    kcalEaten: intake,
    weightKg: 100 + (weeklyChange * index) / 7,
    trendWeightKg: 100 + (weeklyChange * index) / 7,
  }));
}

function input(weeklyChange = 0, intake = 2000): CheckinInput {
  return {
    days: linearDays('2026-11-02', intake, weeklyChange),
    currentTarget: { kcal: 2000, proteinG: 150, carbsG: 215, fatG: 60 },
    goal: { mode: 'weight_date', expectedWeeklyChangeKg: -0.5 },
    profile: { sex: 'male' },
    weightKg: 100,
  };
}

function adjustment(result: CheckinResult) {
  expect(result.status).toBe('adjust');
  if (result.status !== 'adjust') throw new Error('Expected an adjustment');
  return result;
}

describe('evaluateCheckin', () => {
  it('recognizes the planned loss, sorts without mutating and reports rounded metrics', () => {
    const data = input(-0.5);
    data.days.reverse();
    const original = structuredClone(data);
    // -0.5 kg/week costs 550 kcal/day; 2000 + 550 = 2550 TDEE.
    expect(evaluateCheckin(data)).toEqual({
      status: 'on_track',
      loggedDays: 14,
      weighIns: 14,
      avgIntakeKcal: 2000,
      estimatedTdee: 2550,
      actualWeeklyChangeKg: -0.5,
      expectedWeeklyChangeKg: -0.5,
    });
    expect(data).toEqual(original);
  });

  it('reduces kcal for half-speed loss', () => {
    // TDEE = 2275; desired = 1725; -275 is capped to -150.
    expect(adjustment(evaluateCheckin(input(-0.25)))).toMatchObject({
      deltaKcal: -150,
      reason: 'slower_than_plan',
      proposed: { kcal: 1850 },
      actualWeeklyChangeKg: -0.25,
      estimatedTdee: 2275,
    });
  });

  it('increases kcal for double-speed loss', () => {
    // TDEE = 3100; desired = 2550; +550 is capped to +150.
    expect(adjustment(evaluateCheckin(input(-1)))).toMatchObject({
      deltaKcal: 150,
      reason: 'faster_than_plan',
      proposed: { kcal: 2150 },
    });
  });

  it('counts food logs including zero and averages only logged days', () => {
    const data = input();
    data.days.forEach((day, index) => {
      if (index >= 8) day.kcalEaten = null;
    });
    expect(evaluateCheckin(data)).toEqual({
      status: 'insufficient_data',
      loggedDays: 8,
      weighIns: 14,
    });
    data.goal = { mode: 'manual' };
    data.days[8]!.kcalEaten = 0;
    data.days[9]!.kcalEaten = 0;
    // Eight logs at 2000 plus two at zero: 16000 / 10 = 1600.
    expect(evaluateCheckin(data)).toMatchObject({
      status: 'on_track',
      loggedDays: 10,
      avgIntakeKcal: 1600,
    });
  });

  it.each([
    [0, 7, 13],
    [0, 1, 2, 3],
    [7, 8, 9, 10],
  ])('requires four real weigh-ins across both weeks: %j', (...indices) => {
    const data = input(-0.5);
    data.goal = { mode: 'manual' };
    data.days.forEach((day, index) => {
      if (!indices.includes(index)) day.weightKg = null;
    });
    expect(evaluateCheckin(data)).toEqual({
      status: 'insufficient_data',
      loggedDays: 14,
      weighIns: indices.length,
    });
  });

  it('accepts four actual weigh-ins while trends are carried forward', () => {
    const data = input(-0.5);
    data.days.forEach((day, index) => {
      if (![0, 3, 7, 13].includes(index)) day.weightKg = null;
    });
    expect(evaluateCheckin(data)).toMatchObject({ status: 'on_track', weighIns: 4 });
  });

  it.each([[], [0], [0, 6]])(
    'requires trend endpoints at least seven days apart: %j',
    (...indices: number[]) => {
      const data = input();
      data.days.forEach((day, index) => {
        if (!indices.includes(index)) day.trendWeightKg = null;
      });
      expect(evaluateCheckin(data)).toEqual({
        status: 'insufficient_data',
        loggedDays: 14,
        weighIns: 14,
      });
    },
  );

  it('uses the first and last available trend, including a seven-day span', () => {
    const data = input(-0.5);
    data.days.forEach((day, index) => {
      if (index < 3 || index > 10) day.trendWeightKg = null;
    });
    expect(evaluateCheckin(data)).toMatchObject({
      status: 'on_track',
      actualWeeklyChangeKg: -0.5,
      estimatedTdee: 2550,
    });
  });

  it('applies the female floor after all other limits', () => {
    const data = input(0, 1250);
    data.currentTarget = { kcal: 1250, proteinG: 80, carbsG: 120, fatG: 50 };
    data.profile.sex = 'female';
    data.weightKg = 60;
    // desired = 700; 1250 - 150 = 1100; macro floor = 850; sex floor = 1200.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 1200 },
      deltaKcal: -50,
    });
  });

  it('never adjusts manual goals with sufficient data', () => {
    const data = input();
    data.goal = { mode: 'manual' };
    expect(evaluateCheckin(data)).toMatchObject({
      status: 'on_track',
      expectedWeeklyChangeKg: null,
    });
  });

  it('reports slower loss even when the sex floor increases kcal', () => {
    const data = input(0, 1100);
    data.currentTarget = { kcal: 1100, proteinG: 80, carbsG: 120, fatG: 30 };
    data.profile.sex = 'female';
    data.weightKg = 60;
    // Actual = 0 > expected = -0.5; the 1200 kcal sex floor overrides the reduction.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 1200 },
      deltaKcal: 100,
      reason: 'slower_than_plan',
    });
  });

  it('derives the composition rate and adjustment from unrounded estimated TDEE', () => {
    const data = input(0.1, 2115.4);
    data.goal = { mode: 'composition', preset: 'recomp' };
    // TDEE = 2115.4 - 0.1 * 7700 / 7 = 2005.4.
    // Expected = -0.05 * 2005.4 * 7 / 7700 = -0.0911545... kg/week.
    // Desired = 2005.4 * 0.95 = 1905.13; delta = -94.87 -> -90 (uncapped).
    // Rounding TDEE first gives 2005 * 0.95 = 1904.75; delta = -95.25 -> -100.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      estimatedTdee: 2005,
      expectedWeeklyChangeKg: -0.09,
      proposed: { kcal: 1910 },
      deltaKcal: -90,
    });
  });

  it('increases kcal when gain is slower than planned', () => {
    const data = input(0.1);
    data.goal = { mode: 'weight_date', expectedWeeklyChangeKg: 0.3 };
    // TDEE = 1890; desired = 2220; +220 is capped to +150.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      deltaKcal: 150,
      reason: 'slower_than_plan',
    });
  });

  it('keeps 50 g carbs by reducing fat, preserves protein and rounds to tenths', () => {
    const data = input(0, 1800);
    data.weightKg = 80;
    data.currentTarget = { kcal: 1800, proteinG: 150, carbsG: 70, fatG: 102 };
    // Carbs without floor = 70 - 150 / 4 = 32.5; fat = 102 - 17.5 * 4 / 9 = 94.222...
    const { proposed } = adjustment(evaluateCheckin(data));
    expect(proposed).toEqual({ kcal: 1650, proteinG: 150, carbsG: 50, fatG: 94.2 });
    expect(proposed.fatG).toBeGreaterThanOrEqual(48);
  });

  it.each([48, 20])('does not reduce fat below its floor or raise existing low fat: %s', (fatG) => {
    const data = input(0, 1800);
    data.weightKg = 80;
    data.currentTarget = { kcal: 1800, proteinG: 150, carbsG: 70, fatG };
    // Carbs hit 50 g; fat is already at or below 0.6 * 80 = 48 g and stays unchanged.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 1650, proteinG: 150, carbsG: 50, fatG },
    });
  });

  it('applies the macro floor even beyond the adjustment cap and preserves low fat', () => {
    const data = input();
    data.currentTarget = { kcal: 1600, proteinG: 300, carbsG: 55, fatG: 20 };
    // Macro floor = 1200 + 540 + 200 = 1940, overriding the -150 step.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      deltaKcal: 340,
      proposed: { kcal: 1940, proteinG: 300, fatG: 20, carbsG: 140 },
    });
  });

  it('does not round reduced fat below the minimum for fractional reference weight', () => {
    const data = input(0, 1390);
    data.profile.sex = 'female';
    data.weightKg = 80.05;
    data.currentTarget = { kcal: 1390, proteinG: 151.9, carbsG: 59.9, fatG: 60.3 };
    // Carbs without floor = 59.9 - 150 / 4 = 22.4; fat = 60.3 - 27.6 * 4 / 9 = 48.0333...
    // Minimum = 48.03 g, so round inward to 48.1 rather than 48.0.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 1240, proteinG: 151.9, carbsG: 50, fatG: 48.1 },
    });
  });

  it('allows existing sub-50 carbs to increase without reducing fat', () => {
    const data = input(-1, 2000);
    data.currentTarget = { kcal: 2000, proteinG: 150, carbsG: 10, fatG: 151.1 };
    // +150 kcal goes to carbs: 10 + 150 / 4 = 47.5.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 2150, carbsG: 47.5, fatG: 151.1 },
    });
  });

  it('adds kcal to current carbs even when current macros do not match kcal', () => {
    const data = input(-1, 2000);
    data.currentTarget = { kcal: 2000, proteinG: 150, carbsG: 40, fatG: 160 };
    // +150 kcal goes to carbs: 40 + 150 / 4 = 77.5.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 2150, proteinG: 150, carbsG: 77.5, fatG: 160 },
    });
  });

  it('rounds the loss rate cap inward even when it overrides the 150 kcal step', () => {
    const data = input(0, 2507);
    data.weightKg = 80;
    data.currentTarget.kcal = 1700;
    data.goal = { mode: 'weight_date', expectedWeeklyChangeKg: -1 };
    // desired = 1407; step gives 1550; minimum = 2507 - 880 = 1627 -> 1630.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 1630 },
      deltaKcal: -70,
    });
  });

  it('rounds the gain rate cap inward', () => {
    const data = input(0, 2003);
    data.currentTarget.kcal = 2600;
    data.goal = { mode: 'weight_date', expectedWeeklyChangeKg: 1 };
    // desired = 3103; step gives 2750; maximum = 2003 + 550 = 2553 -> 2550.
    expect(adjustment(evaluateCheckin(data))).toMatchObject({
      proposed: { kcal: 2550 },
      deltaKcal: -50,
      reason: 'slower_than_plan',
    });
  });

  it('returns on_track when the rounded adjustment is zero', () => {
    const data = input();
    data.currentTarget.kcal = 1450;
    data.profile.sex = 'female';
    // desired = 2000 - 550 = 1450, despite the observed rate mismatch.
    expect(evaluateCheckin(data)).toMatchObject({ status: 'on_track' });
  });

  it.each([-0.35, -0.65, -0.35 + 5e-10])(
    'includes the tolerance boundary with epsilon: %s',
    (actual) => {
      expect(evaluateCheckin(input(actual))).toMatchObject({ status: 'on_track' });
    },
  );

  it('does not round the rate before comparing tolerance', () => {
    expect(evaluateCheckin(input(-0.349)).status).toBe('adjust');
  });

  it('estimates expenditure using fractional intake and trend change', () => {
    const data = input(0, 2137.4);
    data.goal = { mode: 'manual' };
    data.days[13]!.trendWeightKg = 99.37;
    // 2137.4 + 0.63 * 7700 / 13 = 2510.553846...; -0.63 / 13 * 7 = -0.33923...
    expect(evaluateCheckin(data)).toMatchObject({
      avgIntakeKcal: 2137,
      estimatedTdee: 2511,
      actualWeeklyChangeKg: -0.34,
    });
  });
});

describe('expectedWeeklyChangeForWeightGoal', () => {
  const goal = {
    startWeightKg: 80,
    targetWeightKg: 78,
    startDate: '2026-11-02',
    endDate: '2026-11-30',
  };
  it('returns the signed unrounded weekly change', () => {
    // (78 - 80) / 28 * 7 = -0.5.
    expect(expectedWeeklyChangeForWeightGoal(goal)).toBe(-0.5);
    expect(expectedWeeklyChangeForWeightGoal({ ...goal, targetWeightKg: 82 })).toBe(0.5);
  });
  it.each(['2026-11-02', '2026-11-01'])(
    'returns zero for a nonpositive duration: %s',
    (endDate) => {
      expect(expectedWeeklyChangeForWeightGoal({ ...goal, endDate })).toBe(0);
    },
  );
});
