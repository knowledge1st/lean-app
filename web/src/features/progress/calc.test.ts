import { describe, expect, it } from 'vitest';
import type { ActiveGoal, Entry } from '@lean/shared';
import { log, weekSummary } from './testFixtures';
import {
  buildWeekBars,
  chartAxis,
  expectedWeightAt,
  formatPlanDifference,
  planDifference,
  trajectory,
  weightWindow,
} from './calc';
const points = [
  { date: '2026-01-01', kg: 80 },
  { date: '2026-01-11', kg: 70 },
];
describe('trayectoria', () => {
  it('interpola por fecha, respeta los extremos y no extrapola antes del inicio', () => {
    expect(expectedWeightAt(points, '2025-12-31')).toBeNull();
    expect(expectedWeightAt([], '2026-01-01')).toBeNull();
    expect(expectedWeightAt(points, '2026-01-01')).toBe(80);
    expect(expectedWeightAt(points, '2026-01-06')).toBe(75);
    expect(expectedWeightAt(points, '2026-02-01')).toBe(70);
  });
  it.each([
    [80, 70, 74.6, 'ahead', '0,4 kg por delante del plan'],
    [80, 70, 75.4, 'behind', '0,4 kg por detrás del plan'],
    [70, 80, 75.4, 'ahead', '0,4 kg por delante del plan'],
    [70, 80, 74.6, 'behind', '0,4 kg por detrás del plan'],
    [80, 70, 75.04, 'on_track', 'En línea con el plan'],
    [70, 80, 74.96, 'on_track', 'En línea con el plan'],
    [80, 70, 75.05, 'behind', '0,1 kg por detrás del plan'],
  ])('compara de %s a %s con tendencia %s', (startKg, targetKg, trendKg, kind, text) => {
    const result = planDifference({ startKg, targetKg, trendKg, expectedKg: 75 });
    expect(result.kind).toBe(kind);
    expect(formatPlanDifference(result)).toBe(text);
  });
  const goal = {
    startDate: '2026-01-01',
    startWeightKg: 80,
    targetWeightKg: 70,
    milestones: [
      { date: '2026-12-01', expectedWeightKg: 72, kind: 'final' },
      { date: '2026-04-01', expectedWeightKg: 77, kind: 'month' },
    ],
  } as ActiveGoal;
  it('ordena hitos y termina en el objetivo; sin objetivo no hay trayectoria', () => {
    expect(trajectory(goal).at(-1)).toEqual({ date: '2026-12-01', kg: 70 });
    expect(trajectory({ ...goal, targetWeightKg: null })).toEqual([]);
    expect(trajectory({ ...goal, milestones: [] })).toEqual([]);
  });
  it('Todo abarca el inicio y el final futuro; los rangos cortos terminan hoy', () => {
    const logs = [log('2026-03-01', 78)];
    const all = weightWindow(logs, goal, '2026-06-01', 'all');
    expect(all.from).toBe(goal.startDate);
    expect(all.to).toBe('2026-12-01');
    expect(all.data.at(-1)?.expected).toBe(70);
    const month = weightWindow(logs, goal, '2026-06-01', 'month');
    expect(month.from).toBe('2026-05-02');
    expect(month.to).toBe('2026-06-01');
    expect(month.logs).toHaveLength(0);
    expect(month.data[0]?.expected).not.toBeNull();
    expect(weightWindow(logs, { ...goal, startDate: '2020-01-01' }, '2026-06-01', 'all').from).toBe(
      '2026-03-01',
    );
  });
});
it('calcula barras y proteína solo de comidas de la semana, por día con entradas', () => {
  const entries = [
    { date: '2026-01-05', protein: 30, status: 'eaten' },
    { date: '2026-01-05', protein: 50, status: 'eaten' },
    { date: '2026-01-06', protein: 40, status: 'eaten' },
    { date: '2026-01-07', protein: 900, status: 'planned' },
    { date: '2025-01-01', protein: 900, status: 'eaten' },
  ] as Entry[];
  const result = buildWeekBars(weekSummary, entries);
  expect(result.avgProteinG).toBe(60);
  expect(result.loggedDays).toBe(1);
  expect(result.bars.map((b) => b.label)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  expect(result.bars[0]?.over).toBe(true);
  expect(result.bars[1]).toMatchObject({ targetKcal: null, over: false });
});
it('presenta la semana vacía sin promedio de proteína', () => {
  const result = buildWeekBars(
    { ...weekSummary, loggedDays: 0, days: weekSummary.days.map((d) => ({ ...d, eatenKcal: 0 })) },
    [],
  );
  expect(result.avgProteinG).toBeNull();
  expect(result.loggedDays).toBe(0);
  expect(result.bars.every((b) => b.kcal === 0 && !b.over)).toBe(true);
});

describe('eje entero de peso y medidas', () => {
  it.each([
    [
      [84.1, 86.8],
      [83, 89],
      [83, 85, 87, 89],
    ],
    [[80], [79, 81], [79, 80, 81]],
    [
      [null, undefined, NaN, Infinity],
      [0, 2],
      [0, 1, 2],
    ],
    [
      [20.1, 22.8],
      [19, 25],
      [19, 21, 23, 25],
    ],
    [
      [70, 86],
      [69, 89],
      [69, 74, 79, 84, 89],
    ],
    [
      [60, 88],
      [59, 89],
      [59, 69, 79, 89],
    ],
  ])('calcula dominio y marcas para %j', (values, domain, ticks) => {
    expect(chartAxis(values)).toEqual({ domain, ticks });
  });
  it.each([
    [25, 300],
    [-2.5, 0.1],
    [80.1, 85.9],
  ])('mantiene margen, extremos y espaciado para %j', (...values) => {
    const { domain, ticks } = chartAxis(values);
    expect(domain[0]).toBe(Math.floor(Math.min(...values)) - 1);
    expect(domain[1]).toBeGreaterThanOrEqual(Math.ceil(Math.max(...values)) + 1);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks.at(-1)).toBe(domain[1]);
    expect(ticks.every(Number.isInteger)).toBe(true);
    expect(new Set(ticks.slice(1).map((tick, i) => tick - ticks[i]!)).size).toBe(1);
  });
});
