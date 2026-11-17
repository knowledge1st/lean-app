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
export type MacroKey = (typeof MACROS)[number]['key'];
const KCAL_PER_G: Record<MacroKey, number> = { protein: 4, carbs: 4, fat: 9 };
/** Share of the energy that each macro provides, as percentages that add up to 100. */
export function macroKcalShares(m: Record<MacroKey, number>) {
  const kcal = MACROS.map(({ key }) => Math.max(m[key], 0) * KCAL_PER_G[key]);
  const total = kcal.reduce((sum, value) => sum + value, 0);
  return MACROS.map((macro, index) => ({
    ...macro,
    percent: total > 0 ? ((kcal[index] ?? 0) / total) * 100 : 0,
  }));
}
export const formatNumber = (value: number, maximumFractionDigits = 1) =>
  value.toLocaleString('es-AR', { maximumFractionDigits });
export function decimalValue(value: string): number {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;
}
