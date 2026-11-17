export const formatNumber = (value: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);
export const formatDecimalInput = (value: number) => String(value).replace('.', ',');
export function formatGoalDate(date: string, today: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
export function weeklyChange(value: number) {
  return value === 0
    ? 'Vas a mantener tu peso.'
    : `Vas a ${value < 0 ? 'bajar' : 'subir'} unos ${formatNumber(Math.abs(value))} kg por semana.`;
}
