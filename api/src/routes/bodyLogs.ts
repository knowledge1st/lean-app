import {
  computeTrend,
  progressDateSchema,
  progressRangeSchema,
  putBodyLogSchema,
  type BodyLog,
} from '@lean/shared';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { bodyLogs as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';

export const bodyLogs = new Hono<AppEnv>();
const roundToTwoDecimals = (value: number) =>
  Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
function serialize(row: typeof table.$inferSelect): BodyLog {
  const numeric = (value: string | null) => (value === null ? null : Number(value));
  return {
    date: row.date,
    weightKg: numeric(row.weightKg),
    bodyFatPct: numeric(row.bodyFatPct),
    waistCm: numeric(row.waistCm),
    hipCm: numeric(row.hipCm),
    chestCm: numeric(row.chestCm),
    armCm: numeric(row.armCm),
    thighCm: numeric(row.thighCm),
  };
}
bodyLogs.put(
  '/:date',
  validate('param', progressDateSchema),
  validate('json', putBodyLogSchema),
  async (c) => {
    const input = c.req.valid('json');
    const values = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, String(value)]),
    );
    const [row] = await getDb(c.env)
      .insert(table)
      .values({ userId: c.get('userId'), date: c.req.valid('param').date, ...values })
      .onConflictDoUpdate({
        target: [table.userId, table.date],
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) throw new Error('No se pudo guardar el registro');
    return c.json(serialize(row));
  },
);
bodyLogs.delete('/:date', validate('param', progressDateSchema), async (c) => {
  const [row] = await getDb(c.env)
    .delete(table)
    .where(and(eq(table.userId, c.get('userId')), eq(table.date, c.req.valid('param').date)))
    .returning({ id: table.id });
  if (!row) throw new AppError(404, 'not_found', 'Registro no encontrado');
  return c.body(null, 204);
});
bodyLogs.get('/', validate('query', progressRangeSchema), async (c) => {
  const { from, to } = c.req.valid('query');
  const start = new Date(Date.parse(from) - 60 * 86400000).toISOString().slice(0, 10);
  const rows = (
    await getDb(c.env)
      .select()
      .from(table)
      .where(and(eq(table.userId, c.get('userId')), gte(table.date, start), lte(table.date, to)))
      .orderBy(asc(table.date))
  ).map(serialize);
  const trends = computeTrend(rows);
  return c.json({
    logs: rows.flatMap((row, index) =>
      row.date < from
        ? []
        : [
            {
              ...row,
              trendWeightKg:
                trends[index]!.trendWeightKg === null
                  ? null
                  : roundToTwoDecimals(trends[index]!.trendWeightKg!),
            },
          ],
    ),
  });
});
