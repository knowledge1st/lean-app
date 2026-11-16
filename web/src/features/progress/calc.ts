import type { ActiveGoal, BodyLog, Entry, WeekSummary } from '@lean/shared';
import { addDays } from '../../lib/date';
import { formatNumber } from '../../lib/macros';

export type ProgressLog = BodyLog & { trendWeightKg: number | null };
export type WeightPoint = { date: string; kg: number };
export type WeightRange = 'month' | 'quarter' | 'all';
export const measurements = [
  { key: 'bodyFatPct', label: 'Grasa corporal', unit: '%' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm' },
  { key: 'hipCm', label: 'Cadera', unit: 'cm' },
  { key: 'chestCm', label: 'Pecho', unit: 'cm' },
  { key: 'armCm', label: 'Brazo', unit: 'cm' },
  { key: 'thighCm', label: 'Muslo', unit: 'cm' },
] as const;
export type Measurement = (typeof measurements)[number];
export const bodyFields = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  ...measurements,
] as const;
export const timestamp = (date: string) => Date.parse(`${date}T12:00:00Z`);
export const shortDate = (date: string | number) =>
  new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(typeof date === 'number' ? date : timestamp(date)));
export const signedKg = (value: number) =>
  `${value < 0 ? '−' : value > 0 ? '+' : ''}${formatNumber(Math.abs(value))}`;

export function trajectory(goal: ActiveGoal | null | undefined): WeightPoint[] {
  if (!goal || goal.targetWeightKg === null || !goal.milestones.length) return [];
  return [
    { date: goal.startDate, kg: goal.startWeightKg },
    ...goal.milestones.map((m) => ({
      date: m.date,
      kg: m.kind === 'final' ? goal.targetWeightKg! : m.expectedWeightKg,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
export function expectedWeightAt(points: WeightPoint[], date: string): number | null {
  const first = points[0];
  if (!first || date < first.date) return null;
  for (let i = 1; i < points.length; i++) {
    const next = points[i]!;
    const previous = points[i - 1]!;
    if (date <= next.date) {
      const span = timestamp(next.date) - timestamp(previous.date);
      return span === 0
        ? next.kg
        : previous.kg +
            ((next.kg - previous.kg) * (timestamp(date) - timestamp(previous.date))) / span;
    }
  }
  return points.at(-1)!.kg;
}
export function planDifference({
  trendKg,
  expectedKg,
  startKg,
  targetKg,
}: {
  trendKg: number;
  expectedKg: number;
  startKg: number;
  targetKg: number;
}): { kind: 'ahead' | 'behind' | 'on_track'; kg: number } {
  // Keep the 0.05 kg boundary stable despite binary floating point.
  const diff = Math.round((trendKg - expectedKg) * 1e10) / 1e10;
  return {
    kind: Math.abs(diff) < 0.05 ? 'on_track' : diff * (targetKg - startKg) > 0 ? 'ahead' : 'behind',
    kg: Math.abs(diff),
  };
}
export function formatPlanDifference(result: ReturnType<typeof planDifference>): string {
  if (result.kind === 'on_track') return 'En línea con el plan';
  return `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(result.kg)} kg por ${result.kind === 'ahead' ? 'delante' : 'detrás'} del plan`;
}
export function weightWindow(
  logs: ProgressLog[],
  goal: ActiveGoal | null | undefined,
  today: string,
  range: WeightRange,
) {
  const earliest = logs[0]?.date ?? today;
  const loadedFrom = addDays(today, -365);
  const start =
    goal && goal.startDate < earliest && goal.startDate >= loadedFrom ? goal.startDate : earliest;
  const from = range === 'all' ? start : addDays(today, range === 'month' ? -30 : -90);
  const points = trajectory(goal);
  const to =
    range === 'all' && points.at(-1) && points.at(-1)!.date > today ? points.at(-1)!.date : today;
  const dates = new Set([from, to, ...logs.map((l) => l.date), ...points.map((p) => p.date)]);
  const data = [...dates]
    .filter((d) => d >= from && d <= to)
    .sort()
    .map((date) => {
      const log = logs.find((l) => l.date === date);
      return {
        date,
        time: timestamp(date),
        weight: log?.weightKg ?? null,
        trend: log?.trendWeightKg ?? null,
        expected: expectedWeightAt(points, date),
      };
    });
  return { from, to, data, logs: logs.filter((l) => l.date >= from && l.date <= to) };
}
export function buildWeekBars(summary: WeekSummary, entries: Entry[]) {
  const eaten = entries.filter(
    (e) => e.status === 'eaten' && summary.days.some((d) => d.date === e.date),
  );
  const days = new Set(eaten.map((e) => e.date));
  return {
    bars: summary.days.map((d, i) => ({
      date: d.date,
      label: ['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]!,
      kcal: d.eatenKcal,
      targetKcal: d.targetKcal,
      over: d.targetKcal !== null && d.eatenKcal > d.targetKcal,
    })),
    loggedDays: summary.loggedDays,
    avgProteinG: days.size ? eaten.reduce((sum, e) => sum + e.protein, 0) / days.size : null,
  };
}

// Keep at least one unit of padding and extend the upper bound to a whole step.
export function chartAxis(values: readonly (number | null | undefined)[]): {
  domain: [number, number];
  ticks: number[];
} {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  const min = finite.length ? Math.floor(Math.min(...finite)) - 1 : 0;
  const max = finite.length ? Math.ceil(Math.max(...finite)) + 1 : 2;
  const range = max - min;
  // For wide ranges continue the same 1/2/5/10 sequence at larger magnitudes.
  const magnitude = 10 ** Math.max(0, Math.ceil(Math.log10(range / 40)));
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => Math.ceil(range / n) <= 4)!;
  const intervals = Math.max(2, Math.ceil(range / step));
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => min + i * step);
  return { domain: [min, ticks.at(-1)!], ticks };
}
