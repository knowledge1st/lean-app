import { isoWeekSchema } from '@lean/shared';
import { isoWeek } from '../../lib/date';

const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatWeekRange(from: string, to: string): string {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  const start = `${fromDay} ${months[fromMonth! - 1]}`;
  const end = `${toDay} ${months[toMonth! - 1]}`;
  if (fromYear !== toYear) return `${start} ${fromYear} – ${end} ${toYear}`;
  return fromMonth === toMonth ? `${fromDay} – ${end}` : `${start} – ${end}`;
}

export function validWeekOf(date: string): string | null {
  const result = isoWeekSchema.safeParse(isoWeek(date));
  return result.success ? result.data : null;
}
