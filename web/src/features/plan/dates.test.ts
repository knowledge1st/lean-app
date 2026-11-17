import { expect, it } from 'vitest';
import { formatWeekRange, validWeekOf } from './dates';

it.each([
  ['2026-11-16', '2026-11-22', '16 – 22 nov'],
  ['2026-11-30', '2026-12-06', '30 nov – 6 dic'],
  ['2025-12-29', '2026-01-04', '29 dic 2025 – 4 ene 2026'],
  ['2026-09-07', '2026-09-13', '7 – 13 sep'],
])('formatea el rango %s a %s', (from, to, expected) => {
  expect(formatWeekRange(from, to)).toBe(expected);
});

it.each([
  ['1899-12-25', null],
  ['1900-01-01', '1900-W01'],
  ['2026-11-09', '2026-W46'],
  ['2025-12-29', '2026-W01'],
  ['2101-01-03', null],
])('valida la semana calculada para %s', (date, expected) => {
  expect(validWeekOf(date)).toBe(expected);
});
