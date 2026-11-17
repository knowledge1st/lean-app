import { z } from 'zod';

export const REMINDER_SLOTS = [
  'breakfast',
  'lunch',
  'afternoon_snack',
  'dinner',
  'snack',
  'day_close',
] as const;
export type ReminderSlot = (typeof REMINDER_SLOTS)[number];
export const REMINDER_MESSAGE_MAX = 120;

export const reminderSlotSchema = z.enum(REMINDER_SLOTS, { error: 'Recordatorio inválido' });
export const reminderTimeSchema = z
  .string({ error: 'Hora inválida' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Indicá la hora como HH:MM');

/** Defaults every account starts with. Each one can be turned off or changed. */
export const DEFAULT_REMINDERS: Record<
  ReminderSlot,
  { enabled: boolean; time: string; message: string }
> = {
  breakfast: { enabled: true, time: '09:00', message: '¿Ya desayunaste? Cargá tu desayuno.' },
  lunch: { enabled: true, time: '13:30', message: 'Hora del almuerzo: ¿qué comiste?' },
  afternoon_snack: {
    enabled: true,
    time: '17:30',
    message: '¿Merendaste? Sumá la merienda a tu día.',
  },
  dinner: { enabled: true, time: '21:30', message: '¿Qué cenaste? Cargalo antes de olvidarte.' },
  snack: { enabled: false, time: '11:00', message: '¿Comiste algo entre comidas? Cargalo.' },
  day_close: {
    enabled: true,
    time: '22:30',
    message: 'Hoy no cargaste comidas. ¿Lo hacemos ahora?',
  },
};

export const reminderSchema = z.object({
  slot: reminderSlotSchema,
  enabled: z.boolean(),
  time: reminderTimeSchema,
  /** null means the default message for the slot. */
  message: z.string().nullable(),
  defaultMessage: z.string(),
});
export type Reminder = z.infer<typeof reminderSchema>;
export const remindersResponseSchema = z.object({ reminders: z.array(reminderSchema) });
export type RemindersResponse = z.infer<typeof remindersResponseSchema>;

export const reminderInputSchema = z.strictObject(
  {
    slot: reminderSlotSchema,
    enabled: z.boolean({ error: 'Indicá si está activo' }),
    time: reminderTimeSchema,
    message: z
      .string({ error: 'Mensaje inválido' })
      .trim()
      .max(REMINDER_MESSAGE_MAX, `Máximo ${REMINDER_MESSAGE_MAX} caracteres`)
      .nullable()
      .transform((value) => (value ? value : null)),
  },
  { error: 'Recordatorio inválido' },
);
export const updateRemindersSchema = z.strictObject(
  {
    reminders: z
      .array(reminderInputSchema)
      .min(1, 'Indicá al menos un recordatorio')
      .max(REMINDER_SLOTS.length)
      .refine(
        (items) => new Set(items.map((item) => item.slot)).size === items.length,
        'Recordatorios repetidos',
      ),
  },
  { error: 'Campos inválidos' },
);
export type UpdateRemindersInput = z.infer<typeof updateRemindersSchema>;

const base64Url = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+=*$/, 'Clave inválida');
export const pushSubscriptionInputSchema = z.strictObject(
  {
    endpoint: z
      .url({ protocol: /^https$/, error: 'Endpoint inválido' })
      .max(2048, 'Endpoint inválido'),
    keys: z.object({ p256dh: base64Url, auth: base64Url }, { error: 'Claves inválidas' }),
  },
  { error: 'Suscripción inválida' },
);
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
export const pushEndpointSchema = z.strictObject(
  { endpoint: z.url({ protocol: /^https$/, error: 'Endpoint inválido' }).max(2048) },
  { error: 'Suscripción inválida' },
);

/** What the service worker receives in a push message. */
export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string(),
  tag: z.string(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;
