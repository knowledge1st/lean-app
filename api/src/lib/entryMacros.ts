import { macrosForGrams, roundMacros, type Entry, type Macros } from '@lean/shared';
import type { Food, mealEntries } from '../db/schema';

// Correct binary floating-point noise at decimal ties before persisting four places.
export const storageNumeric = (value: number) =>
  String(Math.round((value + Number.EPSILON * Math.abs(value)) * 10_000) / 10_000);

export function foodEntryMacros(
  food: Pick<Food, 'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>,
  grams: number,
) {
  const macros = macrosForGrams(
    {
      kcal: food.kcalPer100g,
      protein: Number(food.proteinPer100g),
      carbs: Number(food.carbsPer100g),
      fat: Number(food.fatPer100g),
    },
    grams,
  );
  return {
    kcal: storageNumeric(macros.kcal),
    protein: storageNumeric(macros.protein),
    carbs: storageNumeric(macros.carbs),
    fat: storageNumeric(macros.fat),
  };
}

export const storedMacros = (row: {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}): Macros => ({
  kcal: Number(row.kcal),
  protein: Number(row.protein),
  carbs: Number(row.carbs),
  fat: Number(row.fat),
});
export function serializeEntry({
  entry: row,
  food,
}: {
  entry: typeof mealEntries.$inferSelect;
  food: Food;
}): Entry {
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    status: row.status,
    foodId: row.foodId,
    grams: Number(row.grams),
    ...roundMacros(storedMacros(row)),
    food: {
      id: food.id,
      source: food.source,
      name: food.name,
      brand: food.brand,
      servingG: food.servingGrams === null ? null : Number(food.servingGrams),
      servingLabel: food.servingLabel,
    },
    createdAt: row.createdAt.toISOString(),
  };
}
