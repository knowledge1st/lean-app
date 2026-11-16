import { describe, expect, it } from 'vitest';
import { computeTrend } from './trend';

describe('computeTrend', () => {
  it('calculates the known EMA without rounding', () => {
    const result = computeTrend(
      [80, 81, 79].map((weightKg, i) => ({ date: `2026-11-${10 + i}`, weightKg })),
    );
    expect(result.map((p) => p.trendWeightKg)).toEqual([80, 80.1, 79.99]);
  });
  it('sorts without mutating input and carries nulls across missing days', () => {
    const points = Object.freeze([
      { date: '2026-12-01', weightKg: 81 },
      { date: '2026-11-01', weightKg: null },
      { date: '2026-11-10', weightKg: 80 },
      { date: '2026-11-20', weightKg: null },
      { date: '2026-12-02', weightKg: null },
    ]);
    expect(computeTrend(points).map((p) => [p.date, p.trendWeightKg])).toEqual([
      ['2026-11-01', null],
      ['2026-11-10', 80],
      ['2026-11-20', 80],
      ['2026-12-01', 80.1],
      ['2026-12-02', 80.1],
    ]);
    expect(points[0]?.date).toBe('2026-12-01');
    expect(computeTrend(points, 0.5).at(-1)?.trendWeightKg).toBe(80.5);
  });
  it('handles empty and all-null series', () => {
    expect(computeTrend([])).toEqual([]);
    expect(computeTrend([{ date: '2026-11-01', weightKg: null }])[0]?.trendWeightKg).toBeNull();
  });
});
