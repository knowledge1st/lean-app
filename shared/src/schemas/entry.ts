import { z } from 'zod';

export const MEALS = ['breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack'] as const;
export const mealSchema = z.enum(MEALS, { error: 'Comida inválida' });
export type Meal = z.infer<typeof mealSchema>;
export const entryStatusSchema = z.enum(['planned', 'eaten'], { error: 'Estado inválido' });
export type EntryStatus = z.infer<typeof entryStatusSchema>;
export const localDateSchema = z.string({ error: 'Fecha inválida' }).refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Fecha inválida');
export const gramsSchema = z
  .number({ error: 'Los gramos deben ser un número' })
  .gt(0, 'Los gramos deben ser mayores a 0')
  .max(5000, 'Los gramos no pueden superar 5000')
  .refine(
    (n) => Number.isFinite(n) && Number((Math.round(n * 10) / 10).toFixed(1)) === n,
    'Indicá hasta 1 decimal',
  );
const fields = {
  date: localDateSchema,
  meal: mealSchema,
  grams: gramsSchema,
  status: entryStatusSchema,
};
export const createEntrySchema = z.object({
  ...fields,
  foodId: z.uuid({ error: 'Identificador de alimento inválido' }),
  status: entryStatusSchema.default('eaten'),
});
export const updateEntrySchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.values(v).some((value) => value !== undefined), 'Indicá al menos un campo');
export const entriesQuerySchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((v) => v.from <= v.to, 'La fecha inicial no puede superar la fecha final')
  .refine(
    (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 30,
    'El rango no puede superar 31 días',
  );
export const summaryDayQuerySchema = z.object({ date: localDateSchema });
export const macrosSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});
export const targetSchema = macrosSchema.extend({ waterMl: z.number() });
export type Target = z.infer<typeof targetSchema>;
export const entrySchema = macrosSchema.extend({
  id: z.uuid(),
  date: localDateSchema,
  meal: mealSchema,
  status: entryStatusSchema,
  foodId: z.uuid(),
  grams: gramsSchema,
  food: z.object({
    id: z.uuid(),
    source: z.enum(['seed', 'off', 'custom']),
    name: z.string(),
    brand: z.string().nullable(),
    servingG: z.number().nullable(),
    servingLabel: z.string().nullable(),
  }),
  createdAt: z.iso.datetime(),
});
export type Entry = z.infer<typeof entrySchema>;
export const mealSummarySchema = z.object({
  meal: mealSchema,
  eaten: macrosSchema,
  planned: macrosSchema,
  entries: z.array(entrySchema),
});
export const daySummarySchema = z.object({
  date: localDateSchema,
  eaten: macrosSchema,
  planned: macrosSchema,
  meals: z.array(mealSummarySchema),
  target: targetSchema.nullable(),
});
export type DaySummary = z.infer<typeof daySummarySchema>;
