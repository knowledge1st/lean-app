import { updateRemindersSchema } from '@lean/shared';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { reminders as table } from '../db/schema';
import type { AppEnv } from '../env';
import { mergeReminders, refreshSchedule } from '../lib/reminders';
import { validate } from '../lib/validate';

export const reminders = new Hono<AppEnv>();
reminders.get('/', async (c) => {
  const rows = await getDb(c.env)
    .select()
    .from(table)
    .where(eq(table.userId, c.get('userId')));
  return c.json({ reminders: mergeReminders(rows) });
});
reminders.put('/', validate('json', updateRemindersSchema), async (c) => {
  const db = getDb(c.env),
    userId = c.get('userId');
  const values = c.req.valid('json').reminders.map((item) => ({ ...item, userId }));
  await db
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: [table.userId, table.slot],
      set: {
        enabled: sql`excluded.enabled`,
        time: sql`excluded.time`,
        message: sql`excluded.message`,
        updatedAt: sql`now()`,
      },
    });
  await refreshSchedule(c.env, db);
  const rows = await db.select().from(table).where(eq(table.userId, userId));
  return c.json({ reminders: mergeReminders(rows) });
});
