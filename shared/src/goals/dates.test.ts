import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toDay } from './dates';

describe('UTC calendar dates', () => {
  it('counts whole days across leap days, DST and year changes', () => {
    // Feb 28 → Feb 29 → Mar 1 = 2 days; Mar 7 → Mar 10 = 3, regardless of DST.
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-03-07', '2026-03-10')).toBe(3);
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(daysBetween('2026-01-06', '2026-01-05')).toBe(-1);
  });
  it('anchors the epoch and preserves ISO years below 100', () => {
    // Epoch Jan 1 = day 0; Jan 2 = day 1; year 0000 is divisible by 400 and leap.
    expect(toDay('1970-01-01')).toBe(0);
    expect(toDay('1970-01-02')).toBe(1);
    expect(addDays('0000-02-28', 1)).toBe('0000-02-29');
    expect(addDays('0099-12-31', 1)).toBe('0100-01-01');
  });
});
