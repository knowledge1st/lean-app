import { MS_PER_DAY } from './constants';

/** UTC day numbers keep calendar arithmetic independent of time zones and DST. */
export function toDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC interprets years 00–99 as 1900–1999; preserve the literal ISO year.
  utc.setUTCFullYear(year, month - 1, day);
  return utc.getTime() / MS_PER_DAY;
}

export function daysBetween(startDate: string, endDate: string): number {
  return toDay(endDate) - toDay(startDate);
}

export function addDays(date: string, days: number): string {
  return new Date((toDay(date) + days) * MS_PER_DAY).toISOString().split('T')[0]!;
}
