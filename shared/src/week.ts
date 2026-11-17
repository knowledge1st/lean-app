import { z } from 'zod';
import { localDateSchema } from './schemas/entry';

export function firstMonday(year: number): Date {
  const date = new Date(Date.UTC(year, 0, 4));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}
export const isoWeekSchema = z.string({ error: 'Semana inválida' }).refine((week) => {
  if (!/^\d{4}-W\d{2}$/.test(week)) return false;
  const year = Number(week.slice(0, 4)),
    number = Number(week.slice(6));
  if (
    year < 1900 ||
    year > 2100 ||
    number < 1 ||
    number > (firstMonday(year + 1).getTime() - firstMonday(year).getTime()) / (7 * 86400000)
  )
    return false;
  const monday = firstMonday(year);
  monday.setUTCDate(monday.getUTCDate() + (number - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return (
    localDateSchema.safeParse(monday.toISOString().slice(0, 10)).success &&
    localDateSchema.safeParse(sunday.toISOString().slice(0, 10)).success
  );
}, 'Semana ISO inválida');
export function isoWeekRange(week: string): { from: string; to: string } {
  isoWeekSchema.parse(week);
  const date = firstMonday(Number(week.slice(0, 4)));
  date.setUTCDate(date.getUTCDate() + (Number(week.slice(6)) - 1) * 7);
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}
export function isoWeekOf(date: string): string {
  localDateSchema.parse(date);
  const thursday = addDays(date, 3 - weekdayIndex(date));
  const year = Number(thursday.slice(0, 4));
  const week = 1 + Math.floor((Date.parse(date) - firstMonday(year).getTime()) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
