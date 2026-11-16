export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const checkGrams = (grams: number) => {
  if (!Number.isFinite(grams) || grams <= 0) throw new RangeError('Gramos inválidos');
};
export function macrosForGrams(per100g: Macros, grams: number): Macros {
  checkGrams(grams);
  return scaleMacros(per100g, 100, grams);
}
export function scaleMacros(stored: Macros, fromGrams: number, toGrams: number): Macros {
  checkGrams(fromGrams);
  checkGrams(toGrams);
  return {
    kcal: (stored.kcal * toGrams) / fromGrams,
    protein: (stored.protein * toGrams) / fromGrams,
    carbs: (stored.carbs * toGrams) / fromGrams,
    fat: (stored.fat * toGrams) / fromGrams,
  };
}
export function per100gFromServing(values: Macros, servingG: number): Macros {
  const scaled = scaleMacros(values, servingG, 100);
  // Remove binary scaling noise before rounding decimal half-up boundaries.
  const round = (value: number, factor: number) =>
    Math.round(Number((value * factor).toPrecision(12))) / factor;
  return {
    kcal: round(scaled.kcal, 1),
    protein: round(scaled.protein, 100),
    carbs: round(scaled.carbs, 100),
    fat: round(scaled.fat, 100),
  };
}
export function sumMacros(items: Macros[]): Macros {
  // Stored macros have four decimal places (numeric(12,4)); sum integer ten-thousandths.
  const sum = items.reduce(
    (sum, m) => ({
      kcal: sum.kcal + Math.round(m.kcal * 10_000),
      protein: sum.protein + Math.round(m.protein * 10_000),
      carbs: sum.carbs + Math.round(m.carbs * 10_000),
      fat: sum.fat + Math.round(m.fat * 10_000),
    }),
    { ...ZERO_MACROS },
  );
  return {
    kcal: sum.kcal / 10_000,
    protein: sum.protein / 10_000,
    carbs: sum.carbs / 10_000,
    fat: sum.fat / 10_000,
  };
}
export function roundMacros(m: Macros): Macros {
  const round = (value: number, factor: number) => Math.round(value * factor) / factor || 0;
  return {
    kcal: round(m.kcal, 1),
    protein: round(m.protein, 10),
    carbs: round(m.carbs, 10),
    fat: round(m.fat, 10),
  };
}
