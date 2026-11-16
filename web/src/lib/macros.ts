import type { Meal } from '@lean/shared';
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  afternoon_snack: 'Merienda',
  dinner: 'Cena',
  snack: 'Snack',
};
export const MACROS = [
  { key: 'protein', label: 'Proteína', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbohidratos', color: 'var(--carbs)' },
  { key: 'fat', label: 'Grasa', color: 'var(--fat)' },
] as const;
export const formatNumber = (value: number, maximumFractionDigits = 1) =>
  value.toLocaleString('es-AR', { maximumFractionDigits });
export function decimalValue(value: string): number {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;
}
