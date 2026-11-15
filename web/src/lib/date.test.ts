import { expect, it } from 'vitest';
import { addDays, formatDayLabel, parseLocalDateParam, todayLocal } from './date';
it('usa los componentes locales de la fecha, incluso cerca de medianoche', () => {
  const now = new Date(2026, 10, 14, 23, 59);
  expect(todayLocal(now)).toBe('2026-11-14');
  expect(todayLocal(new Date(2026, 0, 2))).toBe('2026-01-02');
});
it.each([
  ['2026-01-31', 1, '2026-02-01'],
  ['2026-12-31', 1, '2027-01-01'],
  ['2024-02-28', 1, '2024-02-29'],
  ['2024-03-01', -1, '2024-02-29'],
  ['2026-03-08', 1, '2026-03-09'],
])('suma días de calendario: %s', (date, n, expected) => expect(addDays(date, n)).toBe(expected));
it.each([null, '', '2026-02-29', '2026-13-01', '1899-12-31', '2101-01-01', '2026-1-01', 'texto'])(
  'rechaza parámetro inválido: %s',
  (value) => expect(parseLocalDateParam(value)).toBeNull(),
);
it('acepta fechas reales y etiqueta días relativos', () => {
  expect(parseLocalDateParam('2024-02-29')).toBe('2024-02-29');
  expect(formatDayLabel('2026-11-14', '2026-11-14')).toBe('Hoy');
  expect(formatDayLabel('2026-11-13', '2026-11-14')).toBe('Ayer');
  expect(formatDayLabel('2026-11-15', '2026-11-14')).toBe('Mañana');
  expect(formatDayLabel('2026-11-01', '2026-11-14')).toMatch(/nov/);
});
