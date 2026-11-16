import { describe, expect, it } from 'vitest';
import { buildMilestones } from './milestones';

describe('buildMilestones', () => {
  it('marks the last nonfinal milestone of each calendar month', () => {
    // Jan 20 → Feb 10 = 21 days; −3/21 kg/day yields 79, 78, then final 77.
    expect(
      buildMilestones({
        startDate: '2026-01-20',
        startWeightKg: 80,
        targetWeightKg: 77,
        endDate: '2026-02-10',
      }),
    ).toEqual([
      { date: '2026-01-27', expectedWeightKg: 79, kind: 'month' },
      { date: '2026-02-03', expectedWeightKg: 78, kind: 'month' },
      { date: '2026-02-10', expectedWeightKg: 77, kind: 'final' },
    ]);
  });
  it('interpolates a gain with a partial final week and rounds final weight', () => {
    // 10 days, +1.24 kg: day 7 = 80 + 1.24·7/10 = 80.868 → 80.9; final 81.24 → 81.2.
    expect(
      buildMilestones({
        startDate: '2026-01-24',
        startWeightKg: 80,
        targetWeightKg: 81.24,
        endDate: '2026-02-03',
      }),
    ).toEqual([
      { date: '2026-01-31', expectedWeightKg: 80.9, kind: 'month' },
      { date: '2026-02-03', expectedWeightKg: 81.2, kind: 'final' },
    ]);
  });
  it('has no monthly marker when there are only final milestones', () => {
    // 6 < 7 days; the sole milestone is the exact target date and 75 kg.
    expect(
      buildMilestones({
        startDate: '2026-01-30',
        startWeightKg: 80,
        targetWeightKg: 75,
        endDate: '2026-02-05',
      }),
    ).toEqual([{ date: '2026-02-05', expectedWeightKg: 75, kind: 'final' }]);
  });
  it.each(['2026-01-05', '2026-01-04'])('returns no milestones for end %s', (endDate) => {
    // Duration 0 or −1 days has no future milestone.
    expect(
      buildMilestones({
        startDate: '2026-01-05',
        startWeightKg: 80,
        targetWeightKg: 75,
        endDate,
      }),
    ).toEqual([]);
  });
});
