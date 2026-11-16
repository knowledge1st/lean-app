import { describe, expect, it, vi } from 'vitest';
import { buildPlan } from './buildPlan';
import type { Body, GoalInput, Plan, Profile } from './types';

const today = '2026-01-05';
const profile: Profile = {
  sex: 'male',
  birthDate: '1996-01-05',
  heightCm: 180,
  activity: 'moderate',
};
const body: Body = { weightKg: 80 };
// Mifflin: 800 + 1125 − 150 + 5 = 1780; TDEE = 1780·1.55 = 2759.
function plan(goal: GoalInput, person = profile, current = body): Plan {
  const result = buildPlan(person, current, goal, today);
  expect(result.daily.carbsG).toBeGreaterThanOrEqual(0);
  expect(new Set(result.warnings.map(({ code }) => code)).size).toBe(result.warnings.length);
  return result;
}
const codes = (result: Plan) => result.warnings.map(({ code }) => code);
const lowWeightWoman: Profile = {
  sex: 'female',
  birthDate: '1996-01-05',
  heightCm: 150,
  activity: 'sedentary',
};

describe('weight-date plans', () => {
  it('loses 5 kg over 12 weeks with exact weekly and monthly milestones', () => {
    // r = −5/84·7 = −5/12; deficit = 5·7700/84 = 458.3333.
    // kcal = 2759 − 458.3333 = 2300.6667 → 2300; budget = 2300·7 = 16100.
    // P = 160; F = 64; C = (2300 − 640 − 576)/4 = 271; water = 2800 → 2750.
    const result = plan({ mode: 'weight_date', targetWeightKg: 75, targetDate: '2026-03-30' });
    expect(result.tdee).toBe(2760);
    expect(result.daily).toEqual({
      kcal: 2300,
      proteinG: 160,
      carbsG: 271,
      fatG: 64,
      waterMl: 2750,
    });
    expect(result.weekly).toEqual({ kcalBudget: 16100, expectedWeightChangeKg: -0.4 });
    // Day 7n weight = 80 − 5n/12, rounded to tenths; 12th week is final.
    expect(result.milestones).toEqual([
      { date: '2026-01-12', expectedWeightKg: 79.6, kind: 'week' },
      { date: '2026-01-19', expectedWeightKg: 79.2, kind: 'week' },
      { date: '2026-01-26', expectedWeightKg: 78.8, kind: 'month' },
      { date: '2026-02-02', expectedWeightKg: 78.3, kind: 'week' },
      { date: '2026-02-09', expectedWeightKg: 77.9, kind: 'week' },
      { date: '2026-02-16', expectedWeightKg: 77.5, kind: 'week' },
      { date: '2026-02-23', expectedWeightKg: 77.1, kind: 'month' },
      { date: '2026-03-02', expectedWeightKg: 76.7, kind: 'week' },
      { date: '2026-03-09', expectedWeightKg: 76.3, kind: 'week' },
      { date: '2026-03-16', expectedWeightKg: 75.8, kind: 'week' },
      { date: '2026-03-23', expectedWeightKg: 75.4, kind: 'month' },
      { date: '2026-03-30', expectedWeightKg: 75, kind: 'final' },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
  });
  it('caps an aggressive deficit and adjusts to the nearest viable whole day', () => {
    // Cap = .01·80 = .8 kg/week; kcal = 2759 − .8·1100 = 1879 → 1880.
    // ceil(5/.8·7) = 44 days; Jan 5 + 44 = Feb 18 (later than Jan 12).
    const result = plan({ mode: 'weight_date', targetWeightKg: 75, targetDate: '2026-01-12' });
    expect(codes(result)).toEqual(['rate_capped']);
    expect(result.daily.kcal).toBe(1880);
    expect(result.weekly).toEqual({ kcalBudget: 13160, expectedWeightChangeKg: -0.8 });
    expect(result.adjusted).toEqual({ targetDate: '2026-02-18' });
    expect(result.milestones.at(-1)).toEqual({
      date: '2026-02-18',
      expectedWeightKg: 75,
      kind: 'final',
    });
  });
  it('keeps an exact one-percent weekly loss at the cap without adjustment', () => {
    // delta = 44.55 − 45 = −.45; r = −.45/7·7 = −.45 = −45·.01.
    // BMR = 450 + 1125 − 150 + 5 = 1430; TDEE = 1430·1.725 = 2466.75.
    // kcal = 2466.75 − .45·1100 = 1971.75 → 1970, above the 1500 floor.
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 44.55, targetDate: '2026-01-12' },
      { ...profile, activity: 'active' },
      { weightKg: 45 },
    );
    expect(result.warnings).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
    expect(result.daily.kcal).toBe(1970);
    expect(result.milestones.at(-1)).toEqual({
      date: '2026-01-12',
      expectedWeightKg: 44.6,
      kind: 'final',
    });
  });
  it('does not add a day to an exact capped duration', () => {
    // delta = 43.68 − 48 = −4.32; cap = 48·.01 = .48 kg/week.
    // BMR = 480 + 1125 − 150 + 5 = 1460; TDEE = 1460·1.725 = 2518.5.
    // kcal = 2518.5 − .48·1100 = 1990.5 > 1500, so only the cap adjusts the date.
    // ceil(4.32/.48·7) = ceil(63) = 63 days; Jan 5 + 63 = Mar 9.
    // Binary division can produce 63.000000000000014 before the ceiling.
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 43.68, targetDate: '2026-01-12' },
      { ...profile, activity: 'active' },
      { weightKg: 48 },
    );
    expect(codes(result)).toEqual(['rate_capped']);
    expect(result.adjusted).toEqual({ targetDate: '2026-03-09' });
    expect(result.milestones.at(-1)?.date).toBe('2026-03-09');
  });
  it.each([
    [80, 80.05, 2810, 80.1],
    [45, 44.95, 2160, 45],
  ])(
    'plans an exact .05 kg difference from %s to %s',
    (weightKg, targetWeightKg, kcal, finalKg) => {
      // |80.05 − 80| = |44.95 − 45| = .05, so neither satisfies |delta| < .05.
      // Over 7 days r = ±.05 and energy change = ±.05·1100 = ±55 kcal/day.
      // At 80 kg: 2759 + 55 = 2814 → 2810. At 45 kg: 1430·1.55 − 55 = 2161.5 → 2160.
      const result = plan(
        { mode: 'weight_date', targetWeightKg, targetDate: '2026-01-12' },
        profile,
        { weightKg },
      );
      expect(result.warnings).toEqual([]);
      expect(result).not.toHaveProperty('adjusted');
      expect(result.daily.kcal).toBe(kcal);
      expect(result.milestones.at(-1)).toEqual({
        date: '2026-01-12',
        expectedWeightKg: finalKg,
        kind: 'final',
      });
    },
  );
  it('applies the female floor and computes the date from the effective deficit', () => {
    // BMR = 450 + 937.5 − 150 − 161 = 1076.5; TDEE = 1291.8.
    // Cap −.45 gives 796.8 kcal, floored to 1200; r = −91.8/1100 = −.0834545.
    // ceil(5·7700/91.8) = 420 days; Jan 5 2026 + 420 = Mar 1 2027.
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 40, targetDate: '2026-01-12' },
      lowWeightWoman,
      { weightKg: 45 },
    );
    expect(codes(result)).toEqual(['rate_capped', 'floor_applied']);
    expect(result.daily.kcal).toBe(1200);
    expect(result.weekly.expectedWeightChangeKg).toBe(-0.1);
    expect(result.adjusted).toEqual({ targetDate: '2027-03-01' });
  });
  it('adjusts for the floor even when the requested rate is below the cap', () => {
    // −5/84·7 = −.41667 is below .45; kcal 1291.8 − 458.333 = 833.467 < 1200.
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 40, targetDate: '2026-03-30' },
      lowWeightWoman,
      { weightKg: 45 },
    );
    expect(codes(result)).toEqual(['floor_applied']);
    expect(result.adjusted).toEqual({ targetDate: '2027-03-01' });
  });
  it.each([
    // Age 80: 450 + 937.5 − 400 − 161 = 826.5; ×1.2 = 991.8; floor rate 208.2/1100 → .2.
    [150, 990, 0.2],
    // Height 177.76: 450 + 1111 − 400 − 161 = 1000; ×1.2 = 1200; floor rate = 0.
    [177.76, 1200, 0],
  ])('reports unreachable loss at TDEE <= floor (height %s)', (heightCm, tdee, rate) => {
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 40, targetDate: '2026-03-30' },
      { ...lowWeightWoman, birthDate: '1946-01-05', heightCm },
      { weightKg: 45 },
    );
    expect(result.tdee).toBe(tdee);
    expect(codes(result)).toEqual(['floor_applied', 'date_unreachable']);
    expect(result.daily.kcal).toBe(1200);
    expect(result.weekly.expectedWeightChangeKg).toBe(rate);
    expect(result.milestones).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
  });
  it('caps a gain to half a percent per week', () => {
    // Cap = .005·80 = .4; kcal = 2759 + .4·1100 = 3199 → 3200.
    // ceil(5/.4·7) = 88 days; Jan 5 + 88 = Apr 3.
    const result = plan({ mode: 'weight_date', targetWeightKg: 85, targetDate: '2026-01-12' });
    expect(codes(result)).toEqual(['rate_capped']);
    expect(result.daily.kcal).toBe(3200);
    expect(result.weekly.expectedWeightChangeKg).toBe(0.4);
    expect(result.adjusted).toEqual({ targetDate: '2026-04-03' });
  });
  it('prioritizes the calorie floor over the gain cap', () => {
    // Age 80, 150 cm, 45 kg, no body fat: BMR = 450 + 937.5 − 400 + 5 = 992.5.
    // TDEE = 992.5·1.2 = 1191; requested r = 5/84·7 = .416667 > .005·45 = .225.
    // Capped kcal = 1191 + .225·7700/7 = 1438.5 < 1500.
    // Orchestrator decision: the safety floor prevails over the gain cap.
    // Floor r = (1500 − 1191)·7/7700 = 309/1100 = .280909... → .3 kg/week.
    // ceil(5 / ((1500 − 1191)·7/7700) · 7) = ceil(38500/309) = ceil(124.595...) = 125.
    // Jan 5 + 125 days = May 10 2026.
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 50, targetDate: '2026-03-30' },
      { sex: 'male', birthDate: '1946-01-05', heightCm: 150, activity: 'sedentary' },
      { weightKg: 45 },
    );
    expect(result.daily.kcal).toBe(1500);
    expect(codes(result)).toEqual(['rate_capped', 'floor_applied']);
    expect(result.weekly.expectedWeightChangeKg).toBe(0.3);
    expect(result.adjusted).toEqual({ targetDate: '2026-05-10' });
  });
  it('allows a modest gain without capping', () => {
    // r = 2/84·7 = 1/6; kcal = 2759 + 183.333 = 2942.333 → 2940; r → .2.
    const result = plan({ mode: 'weight_date', targetWeightKg: 82, targetDate: '2026-03-30' });
    expect(result.daily.kcal).toBe(2940);
    expect(result.weekly.expectedWeightChangeKg).toBe(0.2);
    expect(result.warnings).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
    expect(result.milestones.at(-1)?.expectedWeightKg).toBe(82);
  });
  it.each(['2026-01-04', today])(
    'plans a past or same-day deadline at the maximum rate: %s',
    (targetDate) => {
      // Same −.8 cap and 44-day viable duration as the capped loss; no rate_capped warning.
      const result = plan({ mode: 'weight_date', targetWeightKg: 75, targetDate });
      expect(codes(result)).toEqual(['date_in_past']);
      expect(result.daily.kcal).toBe(1880);
      expect(result.adjusted).toEqual({ targetDate: '2026-02-18' });
    },
  );
  it.each([
    ['2026-03-30', 80, ['already_at_target']],
    ['2026-01-04', 80, ['already_at_target', 'date_in_past']],
    [today, 80.04, ['already_at_target', 'date_in_past']],
  ] as const)('maintains weight for target %s / %s', (targetDate, targetWeightKg, warnings) => {
    // |delta| = 0 or .04 < .05; maintenance 2759 → 2760; weekly change = 0.
    const result = plan({ mode: 'weight_date', targetWeightKg, targetDate });
    expect(codes(result)).toEqual(warnings);
    expect(result.daily.kcal).toBe(2760);
    expect(result.weekly.expectedWeightChangeKg).toBe(0);
    expect(result.milestones).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
  });
  it('applies the floor to maintenance while retaining zero planned change', () => {
    // Age 80, 45 kg: TDEE 991.8 < 1200; already-at-target rule still fixes change at 0.
    const result = plan(
      { mode: 'weight_date', targetWeightKg: 45, targetDate: today },
      { ...lowWeightWoman, birthDate: '1946-01-05' },
      { weightKg: 45 },
    );
    expect(codes(result)).toEqual(['already_at_target', 'date_in_past', 'floor_applied']);
    expect(result.daily.kcal).toBe(1200);
    expect(result.weekly.expectedWeightChangeKg).toBe(0);
    expect(result.milestones).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
  });
});

describe('composition plans', () => {
  it.each([
    // cut: 2759·.8 = 2207.2 → 2210; P = 176, F = 64, C = 232.5 → 233; r = −549/1100 → −.5.
    ['cut', 2210, 176, 233, -0.5],
    // recomp: 2759·.95 = 2621.05 → 2620; P = 160, F = 64, C = 351; r = −139/1100 → −.1.
    ['recomp', 2620, 160, 351, -0.1],
    // bulk: 2759·1.1 = 3034.9 → 3030; P = 144, F = 64, C = 469.5 → 470; r = 271/1100 → .2.
    ['lean_bulk', 3030, 144, 470, 0.2],
  ] as const)('calculates %s', (preset, kcal, proteinG, carbsG, change) => {
    const result = plan({ mode: 'composition', preset });
    expect(result.daily).toEqual({ kcal, proteinG, carbsG, fatG: 64, waterMl: 2750 });
    expect(result.weekly).toEqual({ kcalBudget: kcal * 7, expectedWeightChangeKg: change });
    expect(result.tdee).toBe(2760);
    expect(result.warnings).toEqual([]);
    expect(result.milestones).toEqual([]);
    expect(result).not.toHaveProperty('adjusted');
  });
  it('floors a low-weight cut', () => {
    // 1291.8·.8 = 1033.44 < 1200; r = (1200 − 1291.8)/1100 → −.1.
    const result = plan({ mode: 'composition', preset: 'cut' }, lowWeightWoman, { weightKg: 45 });
    expect(result.daily.kcal).toBe(1200);
    expect(result.weekly.expectedWeightChangeKg).toBe(-0.1);
    expect(codes(result)).toEqual(['floor_applied']);
  });
});

describe('manual plans', () => {
  it('rounds only to integers and does not impose a floor or TDEE', () => {
    // Macro energy = 4·100.4 + 4·99.6 + 9·22.2 = 999.8, within 10% of 1000.6.
    // kcal 1000.6 → 1001; weekly 1001·7 = 7007 (no rounding to tens).
    const result = plan({
      mode: 'manual',
      kcal: 1000.6,
      proteinG: 100.4,
      carbsG: 99.6,
      fatG: 22.2,
    });
    expect(result).toEqual({
      tdee: null,
      daily: { kcal: 1001, proteinG: 100, carbsG: 100, fatG: 22, waterMl: 2750 },
      weekly: { kcalBudget: 7007, expectedWeightChangeKg: null },
      milestones: [],
      warnings: [],
    });
  });
  it('warns when manual macro energy is outside tolerance', () => {
    // 4·100 + 4·100 + 9·10 = 890; |890 − 1000| = 110 > 100.
    const result = plan({ mode: 'manual', kcal: 1000, proteinG: 100, carbsG: 100, fatG: 10 });
    expect(codes(result)).toEqual(['manual_macros_mismatch']);
    expect(result.daily.kcal).toBe(1000);
  });
  it('uses a strict tolerance on the original unrounded manual values', () => {
    // 4·100 + 4·125 = 900: difference 100 is allowed; C = 124.9 gives 899.6, difference 100.4 warns.
    expect(
      plan({ mode: 'manual', kcal: 1000, proteinG: 100, carbsG: 125, fatG: 0 }).warnings,
    ).toEqual([]);
    expect(
      codes(plan({ mode: 'manual', kcal: 1000, proteinG: 100, carbsG: 124.9, fatG: 0 })),
    ).toEqual(['manual_macros_mismatch']);
  });
});

describe('purity', () => {
  it('ignores the system clock and never reads its current time', () => {
    const goals: GoalInput[] = [
      { mode: 'weight_date', targetWeightKg: 75, targetDate: '2026-03-30' },
      { mode: 'composition', preset: 'cut' },
      { mode: 'manual', kcal: 1000, proteinG: 100, carbsG: 100, fatG: 10 },
    ];
    const baseline = goals.map((goal) => plan(goal));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2400-12-31T23:59:59Z'));
    const now = vi.spyOn(Date, 'now');
    try {
      expect(goals.map((goal) => plan(goal))).toEqual(baseline);
      expect(now).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      vi.useRealTimers();
    }
  });
  it('does not mutate its arguments and returns independent results', () => {
    const goal = Object.freeze({
      mode: 'weight_date',
      targetWeightKg: 75,
      targetDate: '2026-03-30',
    } as const);
    const person = Object.freeze({ ...profile });
    const current = Object.freeze({ ...body });
    const first = plan(goal, person, current);
    const second = plan(goal, person, current);
    expect(first).toEqual(second);
    first.warnings.push({ code: 'floor_applied' });
    first.daily.kcal = 0;
    first.milestones[0]!.expectedWeightKg = 0;
    // The independent result retains 2300 kcal and 80 − 5/12 → 79.6 kg at day 7.
    expect(second.warnings).toEqual([]);
    expect(second.daily.kcal).toBe(2300);
    expect(second.milestones[0]!.expectedWeightKg).toBe(79.6);
  });
});
