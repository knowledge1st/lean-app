import { z } from 'zod';
import { isoWeekSchema } from '../week';
import { localDateSchema, mealSchema } from './entry';

const modeSchema = z.enum(['append', 'replace'], { error: 'Modo inválido' });
export const copyEntriesSchema = z
  .discriminatedUnion('scope', [
    z.object({
      scope: z.literal('day'),
      from: localDateSchema,
      to: localDateSchema,
      mode: modeSchema,
    }),
    z.object({
      scope: z.literal('week'),
      from: isoWeekSchema,
      to: isoWeekSchema,
      mode: modeSchema,
    }),
  ])
  .refine((value) => value.from !== value.to, 'El origen y el destino no pueden ser iguales');
export const markEatenSchema = z.object({ date: localDateSchema, meal: mealSchema.optional() });
export type CopyEntriesInput = z.infer<typeof copyEntriesSchema>;
export type MarkEatenInput = z.infer<typeof markEatenSchema>;
