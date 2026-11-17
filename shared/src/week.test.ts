import { describe, expect, it } from 'vitest';
import { addDays, isoWeekOf, isoWeekRange, isoWeekSchema, weekdayIndex } from './week';

describe('week utilities', () => {
  it.each([
    ['2027-01-01', '2026-W53'],
    ['2024-12-30', '2025-W01'],
    ['2021-01-01', '2020-W53'],
    ['2022-01-02', '2021-W52'],
    ['2027-01-04', '2027-W01'],
    ['2020-12-31', '2020-W53'],
  ])('maps %s to %s', (date, week) => expect(isoWeekOf(date)).toBe(week));
  it.each(['2020-W53', '2026-W53', '2025-W01', '2027-W01', '1900-W01', '2100-W51'])(
    'round trips %s',
    (week) => {
      expect(isoWeekSchema.parse(week)).toBe(week);
      const { from, to } = isoWeekRange(week);
      expect(isoWeekOf(from)).toBe(week);
      expect(isoWeekOf(to)).toBe(week);
      expect(weekdayIndex(from)).toBe(0);
      expect(weekdayIndex(to)).toBe(6);
    },
  );
  it.each(['2021-W53', '2025-W53'])('rejects %s', (week) =>
    expect(isoWeekSchema.safeParse(week).success).toBe(false),
  );
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-29', 1, '2024-03-01'],
    ['2024-03-01', -1, '2024-02-29'],
  ])('adds days to %s', (date, days, result) => expect(addDays(date, days)).toBe(result));
});
