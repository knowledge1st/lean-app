import { evaluateCheckin, PRESET_KCAL_PCT } from '@lean/shared';
import { describe, expect, it } from 'vitest';
import { addDays, checkinDays, checkinWindow } from '../src/lib/checkins';
import { buildDemoData, demoWeeklyChange, demoWindow, main } from './seed-demo';
const input = {
  today: '2026-11-16',
  weightKg: 90,
  kcal: 2400,
  expectedWeeklyChangeKg: -0.5,
  food: { kcal: 165, protein: 31.02, carbs: 0, fat: 3.57 },
};
function evaluate(scenario: 'adjust' | 'on_track' | 'insufficient', expected = -0.5) {
  const data = buildDemoData({ ...input, scenario, expectedWeeklyChangeKg: expected });
  return evaluateCheckin({
    days: checkinDays(
      data.from,
      data.weekEnd,
      data.weights.map((row) => ({ ...row, weightKg: String(row.weightKg) })),
      data.meals,
    ),
    currentTarget: { kcal: 2400, proteinG: 180, carbsG: 240, fatG: 80 },
    goal: { mode: 'weight_date', expectedWeeklyChangeKg: expected },
    profile: { sex: 'male' },
    weightKg: 90,
  });
}
describe('demo data', () => {
  it.each(['2026-11-16', '2026-11-17', '2026-11-22', '2027-01-01'])(
    'matches API ISO window on %s',
    (date) => {
      expect(demoWindow(date)).toEqual(checkinWindow(date));
    },
  );
  it('handles year boundaries', () =>
    expect(demoWindow('2027-01-04')).toEqual({
      from: '2026-12-21',
      weekStart: '2026-12-28',
      weekEnd: '2027-01-03',
    }));
  it('deletes weights over the full inclusive API warm-up and evaluation range', () => {
    const data = buildDemoData({ ...input, scenario: 'on_track' });
    const window = checkinWindow(input.today);
    expect(data.weightDeleteFrom).toBe(addDays(window.from, -60));
    expect(data.weekEnd).toBe(window.weekEnd);
    expect(data.weights[0]!.date >= data.weightDeleteFrom).toBe(true);
  });
  it.each(['on_track', 'adjust'] as const)(
    'evaluates %s after replacing old weights throughout the API range',
    (scenario) => {
      const data = buildDemoData({ ...input, scenario });
      const window = checkinWindow(input.today);
      const oldWeights = [
        addDays(window.from, -61),
        addDays(window.from, -60),
        addDays(window.from, -30),
        addDays(window.from, -7),
        window.from,
        window.weekEnd,
        addDays(window.weekEnd, 1),
      ].map((date) => ({ date, weightKg: '100' }));
      const remaining = oldWeights.filter(
        (row) => row.date < data.weightDeleteFrom || row.date > data.weekEnd,
      );
      expect(remaining.map((row) => row.date)).toEqual([
        addDays(window.from, -61),
        addDays(window.weekEnd, 1),
      ]);
      const result = evaluateCheckin({
        days: checkinDays(
          window.from,
          window.weekEnd,
          [
            ...remaining,
            ...data.weights.map((row) => ({ ...row, weightKg: String(row.weightKg) })),
          ],
          data.meals,
        ),
        currentTarget: { kcal: 2400, proteinG: 180, carbsG: 240, fatG: 80 },
        goal: { mode: 'weight_date', expectedWeeklyChangeKg: -0.5 },
        profile: { sex: 'male' },
        weightKg: input.weightKg,
      });
      expect(result.status).toBe(scenario);
    },
  );
  it.each(['adjust', 'on_track', 'insufficient'] as const)(
    'builds and evaluates %s',
    (scenario) => {
      const data = buildDemoData({ ...input, scenario });
      expect(data.meals).toHaveLength(scenario === 'insufficient' ? 6 : 13);
      expect(data.weights).toHaveLength(scenario === 'insufficient' ? 3 : 8);
      expect(data.weights[0]!.date).toBe('2026-10-26');
      expect(data.avgIntakeKcal).toBe(input.kcal);
      expect((data.meals[0]!.grams * input.food.kcal) / 100).toBeCloseTo(input.kcal, 0);
      expect(evaluate(scenario).status).toBe(
        scenario === 'insufficient' ? 'insufficient_data' : scenario,
      );
    },
  );
  it.each([-1, -0.5, 0, 0.5, 1])('follows a planned weekly change of %s with EMA', (change) => {
    const result = evaluate('on_track', change);
    expect(result.status).toBe('on_track');
    if (result.status !== 'insufficient_data')
      expect(result.actualWeeklyChangeKg).toBeCloseTo(change, 2);
  });
  it('calculates weight goals and missing milestones', () => {
    const goal = {
      mode: 'target_weight',
      startWeightKg: 100,
      targetWeightKg: 90,
      startDate: '2026-01-01',
      endDate: '2026-05-21',
      preset: null,
    };
    expect(demoWeeklyChange(goal, 2400)).toBe(-0.5);
    expect(demoWeeklyChange({ ...goal, endDate: goal.startDate }, 2400)).toBe(0);
    expect(demoWeeklyChange({ ...goal, mode: 'manual' }, 2400)).toBe(0);
  });
  it.each(['cut', 'recomp', 'lean_bulk'] as const)(
    'matches composition expectation for %s',
    (preset) => {
      const actual = demoWeeklyChange(
        {
          mode: 'body_composition',
          startWeightKg: 90,
          targetWeightKg: null,
          startDate: '',
          endDate: '',
          preset,
        },
        2400,
      );
      expect(actual).toBeCloseTo((PRESET_KCAL_PCT[preset] * (2400 - actual * 1100)) / 1100);
    },
  );
  it('imports without running I/O', () => expect(typeof main).toBe('function'));
});

it('carries warmed trends across days without weights and preserves zero intake', () => {
  const days = checkinDays(
    '2026-11-02',
    '2026-11-15',
    [
      { date: '2026-09-02', weightKg: '500' },
      { date: '2026-09-03', weightKg: '100' },
      { date: '2026-11-04', weightKg: '90' },
      { date: '2026-11-05', weightKg: null },
    ],
    [{ date: '2026-11-02', kcal: 0 }],
  );
  expect(days).toHaveLength(14);
  expect(days[0]).toMatchObject({ kcalEaten: 0, weightKg: null, trendWeightKg: 100 });
  expect(days[1]).toMatchObject({ kcalEaten: null, weightKg: null, trendWeightKg: 100 });
  expect(days[2]).toMatchObject({ weightKg: 90, trendWeightKg: 99 });
  expect(days.at(-1)).toMatchObject({ weightKg: null, trendWeightKg: 99 });
});
