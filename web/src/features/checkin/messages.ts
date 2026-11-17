import type { Checkin } from '@lean/shared';
import { formatNumber } from '../../lib/macros';

export const WINDOW_DAYS = 14;
export const MIN_LOGGED_DAYS = 10;
export const MIN_WEIGH_INS = 4;
const kcalFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: true });
const kgFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, useGrouping: true });
export const formatKcal = (n: number) => kcalFormat.format(n);
export const formatKg = (n: number) => kgFormat.format(Math.abs(n));
export function normalizeWeightChange(n: number | null): number | null {
  if (n === null) return null;
  // Match Intl.NumberFormat's rounding of half increments away from zero.
  const magnitude = Math.round(Math.abs(n) * 10) / 10;
  return magnitude === 0 ? 0 : Math.sign(n) * magnitude;
}
export function checkinTitle(c: Checkin): string {
  return c.status === 'adjust'
    ? 'Tu revisión semanal'
    : c.status === 'on_track'
      ? 'Vas según el plan'
      : 'Tu semana registrada';
}
function weightChange(n: number | null): string {
  if (n === null) return 'Revisamos tu semana';
  if (n === 0) return 'Tu peso se mantuvo esta semana';
  return `${n < 0 ? 'Bajaste' : 'Subiste'} ${formatKg(n)} kg esta semana`;
}
export function checkinMessage(c: Checkin): string {
  if (c.status === 'insufficient_data') {
    const days =
      c.loggedDays === 1
        ? `1 día de ${formatNumber(WINDOW_DAYS, 0)}`
        : `${formatNumber(c.loggedDays, 0)} de ${formatNumber(WINDOW_DAYS, 0)} días`;
    const weights =
      c.weighIns < MIN_WEIGH_INS
        ? ` y ${formatNumber(c.weighIns, 0)} ${c.weighIns === 1 ? 'pesaje' : 'pesajes'}`
        : '';
    return `Registraste ${days}${weights}. Con ${formatNumber(MIN_LOGGED_DAYS, 0)} días y ${formatNumber(MIN_WEIGH_INS, 0)} pesajes podemos ajustar tu plan.`;
  }
  const actual = normalizeWeightChange(c.actualWeeklyChangeKg);
  const expected = normalizeWeightChange(c.expectedWeeklyChangeKg);
  if (c.status === 'on_track') {
    if (actual === null) return 'Vas según el plan. Revisamos tu semana.';
    if (actual < 0) return `Vas según el plan: ${formatKg(actual)} kg esta semana.`;
    const change = weightChange(actual);
    return `Vas según el plan: ${change.charAt(0).toLowerCase()}${change.slice(1)}.`;
  }
  const plan =
    expected === null
      ? ''
      : expected === 0
        ? '; el plan era mantenerlo'
        : `; el plan era ${actual !== null && Math.sign(actual) === Math.sign(expected) ? '' : expected < 0 ? 'bajar ' : 'subir '}${formatKg(expected)} kg`;
  const proposal = c.proposed
    ? ` Te proponemos pasar de ${formatKcal(c.current.kcal)} a ${formatKcal(c.proposed.kcal)} kcal por día.`
    : '';
  return `${weightChange(actual)}${plan}.${proposal}`;
}
export function checkinStatusLabel(c: Checkin): string {
  return {
    adjust: 'Ajuste propuesto',
    on_track: 'En camino',
    insufficient_data: 'Datos insuficientes',
  }[c.status];
}
export function checkinDecisionLabel(c: Checkin): string {
  if (!c.resolvedAt) return 'Pendiente';
  if (c.status === 'on_track') return 'Visto';
  if (c.status === 'insufficient_data') return 'Descartado';
  return c.accepted ? 'Aceptado' : 'Mantenido';
}
