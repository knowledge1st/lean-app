import { z } from 'zod';
import { isoWeekSchema } from '../week';

const labelSchema = z
  .string({ error: 'Nombre inválido' })
  .trim()
  .min(1, 'Indicá un nombre')
  .max(120, 'El nombre no puede superar 120 caracteres');
const quantitySchema = z
  .number({ error: 'La cantidad debe ser un número' })
  .gt(0, 'La cantidad debe ser mayor a 0')
  .max(100000, 'La cantidad no puede superar 100000 g')
  .refine((n) => Math.round(n * 10) / 10 === n, 'Indicá hasta 1 decimal');
export const shoppingItemSchema = z.object({
  id: z.uuid(),
  foodId: z.uuid().nullable(),
  label: z.string(),
  totalGrams: z.number().nullable(),
  checked: z.boolean(),
  manual: z.boolean(),
});
export const shoppingWeekQuerySchema = z.object({ week: isoWeekSchema });
export const generateShoppingSchema = z.object({ week: isoWeekSchema });
export const createShoppingItemSchema = z.object({
  week: isoWeekSchema,
  label: labelSchema,
  quantity: quantitySchema.optional(),
});
export const updateShoppingItemSchema = z
  .object({
    checked: z.boolean().optional(),
    label: labelSchema.optional(),
    quantity: quantitySchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), 'Indicá al menos un campo');
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type ShoppingWeekQuery = z.infer<typeof shoppingWeekQuerySchema>;
export type GenerateShoppingInput = z.infer<typeof generateShoppingSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
