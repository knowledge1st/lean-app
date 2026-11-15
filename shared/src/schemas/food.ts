import { z } from 'zod';

export const barcodeSchema = z
  .string({ error: 'Código de barras inválido' })
  .regex(/^\d{8,14}$/, 'Código de barras inválido');
export const foodSchema = z.object({
  id: z.uuid().nullable(),
  source: z.enum(['seed', 'off', 'custom']),
  name: z.string(),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  servingG: z.number().nullable(),
  servingLabel: z.string().nullable(),
});
export const foodSearchResponseSchema = z.object({
  items: z.array(foodSchema),
  offAvailable: z.boolean(),
});
const decimal = (max: number, places: number) =>
  z
    .number({ error: 'Debe ser un número' })
    .min(0, 'Debe ser mayor o igual a 0')
    .max(max, `Debe ser menor o igual a ${max}`)
    .refine(
      (n) => Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) < 1e-8,
      `Debe tener hasta ${places} decimales`,
    );
const fields = {
  name: z
    .string({ error: 'Nombre requerido' })
    .trim()
    .min(1, 'Nombre requerido')
    .max(120, 'Nombre demasiado largo'),
  brand: z
    .string({ error: 'Marca inválida' })
    .trim()
    .max(80, 'Marca demasiado larga')
    .transform((s) => s || undefined)
    .optional(),
  barcode: barcodeSchema.optional(),
  kcal: z
    .number({ error: 'Calorías inválidas' })
    .int('Las calorías deben ser enteras')
    .min(0, 'Calorías inválidas')
    .max(900, 'Calorías inválidas'),
  protein: decimal(100, 2),
  carbs: decimal(100, 2),
  fat: decimal(100, 2),
  servingG: decimal(5000, 1)
    .refine((n) => n > 0, 'La porción debe ser mayor a 0')
    .optional(),
  servingLabel: z
    .string({ error: 'Porción inválida' })
    .trim()
    .min(1, 'Porción requerida')
    .max(40, 'Porción demasiado larga')
    .optional(),
};
export const createFoodSchema = z.object(fields).superRefine((value, ctx) => {
  if (value.protein + value.carbs + value.fat > 100 + 1e-8)
    ctx.addIssue({ code: 'custom', message: 'La suma de macros no puede superar 100 g' });
  if ((value.servingG != null) !== (value.servingLabel != null))
    ctx.addIssue({
      code: 'custom',
      message: 'Indicá los gramos y la descripción de la porción juntos',
    });
});
export const updateFoodSchema = z
  .object({
    ...fields,
    brand: fields.brand.nullable(),
    barcode: fields.barcode.nullable(),
    servingG: fields.servingG.nullable(),
    servingLabel: fields.servingLabel.nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Indicá al menos un campo');
const limitSchema = (fallback: number) =>
  z.coerce
    .number({ error: 'Límite inválido' })
    .int('Límite inválido')
    .min(1, 'Límite inválido')
    .max(50, 'Límite inválido')
    .default(fallback);
export const foodSearchQuerySchema = z.object({
  q: z
    .string({ error: 'Búsqueda requerida' })
    .trim()
    .min(1, 'Búsqueda requerida')
    .max(80, 'Búsqueda demasiado larga'),
  limit: limitSchema(20),
});
export const foodListQuerySchema = z.object({ limit: limitSchema(10) });
export const importFoodSchema = z.object({ barcode: barcodeSchema });
export type Barcode = z.infer<typeof barcodeSchema>;
export type Food = z.infer<typeof foodSchema>;
export type FoodSearchResponse = z.infer<typeof foodSearchResponseSchema>;
export type CreateFood = z.infer<typeof createFoodSchema>;
export type UpdateFood = z.infer<typeof updateFoodSchema>;
export type FoodSearchQuery = z.infer<typeof foodSearchQuerySchema>;
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;
export type ImportFood = z.infer<typeof importFoodSchema>;
