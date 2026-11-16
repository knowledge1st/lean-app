import { addWaterSchema, progressDateSchema } from '@lean/shared';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, type Db } from '../db/client';
import { waterLogs as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';

export const water = new Hono<AppEnv>();
export async function selectWater(db: Db, userId: string, date: string): Promise<number> {
  const [row] = await db
    .select({ ml: sql<number>`coalesce(sum(${table.ml}), 0)`.mapWith(Number) })
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.date, date)));
  return row?.ml ?? 0;
}
water.get('/', validate('query', progressDateSchema), async (c) => {
  const { date } = c.req.valid('query');
  return c.json({ date, ml: await selectWater(getDb(c.env), c.get('userId'), date) });
});
water.post('/', validate('json', addWaterSchema), async (c) => {
  const { date, ml } = c.req.valid('json'),
    userId = c.get('userId'),
    db = getDb(c.env);
  // The second statement gets a fresh snapshot after the transaction lock is acquired.
  // INSERT depends on DELETE so all legacy duplicate rows are replaced together.
  const [, result] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(4, hashtext(${userId + ':' + date}))`),
    db.execute<{ ml: number; applied: boolean }>(sql`
      WITH current_total AS (
        SELECT coalesce(sum(ml), 0) AS ml FROM water_logs
        WHERE user_id = ${userId}::uuid AND date = ${date}::date
      ), next_total AS (
        SELECT greatest(0, ml + ${ml}::integer)::integer AS ml FROM current_total
      ), deleted AS (
        DELETE FROM water_logs WHERE user_id = ${userId}::uuid AND date = ${date}::date
          AND (SELECT ml <= 10000 FROM next_total) RETURNING id
      ), inserted AS (
        INSERT INTO water_logs (user_id, date, ml)
        SELECT ${userId}::uuid, ${date}::date, next_total.ml FROM next_total
        CROSS JOIN (SELECT count(*) FROM deleted) AS deletion
        WHERE next_total.ml <= 10000 RETURNING ml
      )
      SELECT ml, true AS applied FROM inserted
      UNION ALL SELECT ml, false AS applied FROM current_total WHERE NOT EXISTS (SELECT 1 FROM inserted)
    `),
  ]);
  const row = result.rows[0];
  if (!row) throw new Error('No se pudo guardar el agua');
  if (!row.applied)
    throw new AppError(400, 'water_limit', 'El agua del día no puede superar 10.000 ml');
  return c.json({ date, ml: Number(row.ml) });
});
