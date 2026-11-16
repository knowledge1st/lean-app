import { z } from 'zod';
import { localDateSchema } from './entry';

const bounded = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label}: indicá un número finito` })
    .min(min, `${label}: mínimo ${min}`)
    .max(max, `${label}: máximo ${max}`);
const bodyFields = {
  weightKg: bounded(25, 300, 'Peso'),
  bodyFatPct: bounded(3, 60, 'Grasa corporal'),
  waistCm: bounded(20, 250, 'Cintura'),
  hipCm: bounded(20, 250, 'Cadera'),
  chestCm: bounded(20, 250, 'Pecho'),
  armCm: bounded(20, 250, 'Brazo'),
  thighCm: bounded(20, 250, 'Muslo'),
};
const nonempty = (value: Record<string, unknown>) =>
  Object.values(value).some((field) => field !== undefined);
export const putBodyLogSchema = z
  .strictObject(bodyFields, { error: 'Campos de cuerpo inválidos' })
  .partial()
  .refine(nonempty, 'Indicá al menos un campo');
export const progressDateSchema = z.object({ date: localDateSchema });
export const progressIdSchema = z.object({ id: z.uuid({ error: 'Identificador inválido' }) });
export const progressRangeSchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((v) => v.from <= v.to, 'La fecha inicial no puede superar la fecha final')
  .refine(
    (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 365,
    'El rango no puede superar 366 días',
  );
export const bodyLogSchema = z.object({
  date: localDateSchema,
  weightKg: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  waistCm: z.number().nullable(),
  hipCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  armCm: z.number().nullable(),
  thighCm: z.number().nullable(),
});
export type BodyLog = z.infer<typeof bodyLogSchema>;
export const addWaterSchema = z.strictObject(
  {
    date: localDateSchema,
    ml: bounded(-10000, 10000, 'Agua')
      .int('Indicá mililitros enteros')
      .refine((v) => v !== 0, 'El agua debe ser distinta de 0'),
  },
  { error: 'Campos de agua inválidos' },
);
const exerciseFields = {
  date: localDateSchema,
  activity: z
    .string({ error: 'Actividad inválida' })
    .trim()
    .min(1, 'Indicá una actividad')
    .max(100, 'La actividad no puede superar 100 caracteres'),
  minutes: bounded(1, 600, 'Minutos').int('Indicá minutos enteros'),
  kcal: bounded(0, 3000, 'Calorías').int('Indicá calorías enteras'),
};
export const createExerciseSchema = z.strictObject(
  {
    ...exerciseFields,
    kcal: exerciseFields.kcal.default(0),
  },
  { error: 'Campos de ejercicio inválidos' },
);
export const updateExerciseSchema = z
  .strictObject(exerciseFields, { error: 'Campos de ejercicio inválidos' })
  .partial()
  .refine(nonempty, 'Indicá al menos un campo');
export const exerciseLogSchema = z.object({ id: z.uuid(), ...exerciseFields });
export type ExerciseLog = z.infer<typeof exerciseLogSchema>;
