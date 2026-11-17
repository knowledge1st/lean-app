import { isoWeekSchema } from '../week';
import { z } from 'zod';
import { localDateSchema, targetSchema } from './entry';
import { oneDecimalSchema } from './profile';

const weightSchema = oneDecimalSchema.refine(
  (n) => n >= 20 && n <= 400,
  'El peso debe estar entre 20 y 400 kg',
);
const macroSchema = oneDecimalSchema.refine(
  (n) => n >= 0 && n <= 1000,
  'Los macros deben estar entre 0 y 1000 g',
);
const presetSchema = z.enum(['cut', 'recomp', 'lean_bulk'], { error: 'Preset inválido' });
export const goalInputSchema = z.discriminatedUnion(
  'mode',
  [
    z.strictObject(
      { mode: z.literal('weight_date'), targetWeightKg: weightSchema, targetDate: localDateSchema },
      { error: 'Objetivo inválido' },
    ),
    z.strictObject(
      { mode: z.literal('composition'), preset: presetSchema },
      { error: 'Objetivo inválido' },
    ),
    z.strictObject(
      {
        mode: z.literal('manual'),
        kcal: z
          .number({ error: 'Calorías inválidas' })
          .int('Indicá calorías enteras')
          .min(500, 'Mínimo 500 kcal')
          .max(10000, 'Máximo 10000 kcal'),
        proteinG: macroSchema,
        carbsG: macroSchema,
        fatG: macroSchema,
      },
      { error: 'Objetivo inválido' },
    ),
  ],
  { error: 'Modo de objetivo inválido' },
);
export const createGoalSchema = z.strictObject(
  {
    goal: goalInputSchema,
    weightKg: weightSchema,
    bodyFatPct: oneDecimalSchema
      .refine((n) => n >= 2 && n <= 75, 'La grasa corporal debe estar entre 2 y 75 %')
      .optional(),
  },
  { error: 'Campos de objetivo inválidos' },
);
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export const targetsQuerySchema = z.object({ date: localDateSchema });

export { isoWeekSchema, isoWeekRange } from '../week';
export const summaryWeekQuerySchema = z.object({ week: isoWeekSchema });
const milestoneSchema = z.object({
  date: localDateSchema,
  expectedWeightKg: z.number(),
  kind: z.enum(['week', 'month', 'final']),
});
export const planSchema = z.object({
  tdee: z.number().nullable(),
  daily: z.object({
    kcal: z.number(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
    waterMl: z.number(),
  }),
  weekly: z.object({ kcalBudget: z.number(), expectedWeightChangeKg: z.number().nullable() }),
  milestones: z.array(milestoneSchema),
  warnings: z.array(
    z.object({
      code: z.enum([
        'rate_capped',
        'floor_applied',
        'date_unreachable',
        'date_in_past',
        'already_at_target',
        'manual_macros_mismatch',
      ]),
    }),
  ),
  adjusted: z.object({ targetDate: localDateSchema }).optional(),
});
export type PlanResponse = z.infer<typeof planSchema>;
export const activeGoalSchema = z.object({
  id: z.uuid(),
  mode: z.enum(['weight_date', 'composition', 'manual']),
  preset: presetSchema.nullable(),
  startDate: localDateSchema,
  startWeightKg: z.number(),
  targetWeightKg: z.number().nullable(),
  targetDate: localDateSchema.nullable(),
  target: targetSchema,
  milestones: z.array(milestoneSchema),
  progress: z.object({
    startWeightKg: z.number(),
    currentWeightKg: z.number(),
    targetWeightKg: z.number().nullable(),
    percent: z.number().nullable(),
  }),
});
export type ActiveGoal = z.infer<typeof activeGoalSchema>;
export const weekSummarySchema = z.object({
  week: isoWeekSchema,
  from: localDateSchema,
  to: localDateSchema,
  days: z
    .array(
      z.object({ date: localDateSchema, eatenKcal: z.number(), targetKcal: z.number().nullable() }),
    )
    .length(7),
  eatenKcal: z.number(),
  budgetKcal: z.number().nullable(),
  remainingKcal: z.number().nullable(),
  loggedDays: z.number(),
  expectedWeightKg: z.number().nullable(),
});
export type WeekSummary = z.infer<typeof weekSummarySchema>;
export const updateTargetKcalSchema = z.strictObject(
  {
    kcal: z
      .number({ error: 'Calorías inválidas' })
      .int('Indicá calorías enteras')
      .min(500, 'Mínimo 500 kcal')
      .max(10000, 'Máximo 10000 kcal'),
  },
  { error: 'Campos inválidos' },
);
export type UpdateTargetKcalInput = z.infer<typeof updateTargetKcalSchema>;
