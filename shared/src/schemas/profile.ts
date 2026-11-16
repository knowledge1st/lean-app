import { z } from 'zod';
import { localDateSchema } from './entry';

export const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const oneDecimalSchema = z
  .number({ error: 'Indicá un número' })
  .refine((n) => Number.isFinite(n) && Math.round(n * 10) / 10 === n, 'Indicá hasta 1 decimal');
const timeZoneSchema = z.string({ error: 'Zona horaria inválida' }).refine((timeZone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone.length > 0;
  } catch {
    return false;
  }
}, 'Zona horaria inválida');
const fields = {
  sex: z.enum(['female', 'male'], { error: 'Sexo inválido' }),
  birthDate: localDateSchema,
  heightCm: oneDecimalSchema.refine(
    (n) => n >= 100 && n <= 250,
    'La altura debe estar entre 100 y 250 cm',
  ),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active'], {
    error: 'Actividad inválida',
  }),
  timeZone: timeZoneSchema,
};
export const profileInputSchema = z.strictObject(
  {
    ...fields,
    timeZone: timeZoneSchema.default(DEFAULT_TIME_ZONE),
  },
  { error: 'Campos de perfil inválidos' },
);
export const profileSchema = z.object({ ...fields, heightCm: z.number(), timeZone: z.string() });
export type ProfileInput = z.input<typeof profileInputSchema>;
export type ProfileResponse = z.infer<typeof profileSchema>;
