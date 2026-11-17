import { z } from 'zod';
import { localDateSchema } from './entry';

export const checkinStatusSchema = z.enum(['insufficient_data', 'on_track', 'adjust']);
export const checkinReasonSchema = z.enum(['slower_than_plan', 'faster_than_plan']);
const macros = z.object({
  kcal: z.number().int(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});
export const checkinSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid(),
  weekStart: localDateSchema,
  weekEnd: localDateSchema,
  status: checkinStatusSchema,
  loggedDays: z.number().int(),
  weighIns: z.number().int(),
  avgIntakeKcal: z.number().int().nullable(),
  estimatedTdee: z.number().int().nullable(),
  trendWeightKg: z.number().nullable(),
  actualWeeklyChangeKg: z.number().nullable(),
  expectedWeeklyChangeKg: z.number().nullable(),
  current: macros,
  proposed: macros.nullable(),
  deltaKcal: z.number().int().nullable(),
  reason: checkinReasonSchema.nullable(),
  accepted: z.boolean().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Checkin = z.infer<typeof checkinSchema>;
export const pendingCheckinResponseSchema = z.object({ checkin: checkinSchema.nullable() });
export const resolveCheckinSchema = z.strictObject({ accept: z.boolean() });
export const checkinsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(52).default(10),
});
export const checkinsResponseSchema = z.object({ checkins: z.array(checkinSchema) });
