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
export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (sum, m) => ({
      kcal: sum.kcal + m.kcal,
      protein: sum.protein + m.protein,
      carbs: sum.carbs + m.carbs,
      fat: sum.fat + m.fat,
    }),
    { ...ZERO_MACROS },
  );
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
