import { profileInputSchema, type ProfileResponse } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, type Db } from '../db/client';
import { profiles, type Profile } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { today } from '../lib/today';
import { validate } from '../lib/validate';
import { refreshSchedule } from '../lib/reminders';

export async function selectProfile(db: Db, userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return row;
}
export function serializeProfile(row: Profile | undefined): ProfileResponse | null {
  if (
    !row ||
    row.sex === null ||
    row.birthDate === null ||
    row.heightCm === null ||
    row.activityLevel === null
  )
    return null;
  return {
    sex: row.sex,
    birthDate: row.birthDate,
    heightCm: Number(row.heightCm),
    activityLevel: row.activityLevel,
    timeZone: row.timeZone,
  };
}
export const profile = new Hono<AppEnv>();
profile.get('/', async (c) => {
  const result = serializeProfile(await selectProfile(getDb(c.env), c.get('userId')));
  if (!result) throw new AppError(404, 'profile_not_found', 'Perfil no encontrado');
  return c.json(result);
});
profile.put('/', validate('json', profileInputSchema), async (c) => {
  const input = c.req.valid('json');
  if (input.birthDate >= today(input.timeZone))
    throw new AppError(
      400,
      'validation_error',
      'birthDate: La fecha de nacimiento debe ser anterior a hoy',
    );
  const values = { ...input, heightCm: String(input.heightCm) };
  const db = getDb(c.env);
  const [row] = await db
    .insert(profiles)
    .values({ userId: c.get('userId'), ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...values, updatedAt: new Date() } })
    .returning();
  // Reminder times are local: a new time zone changes when they fire.
  await refreshSchedule(c.env, db);
  return c.json(serializeProfile(row)!);
});
