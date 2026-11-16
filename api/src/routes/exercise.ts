import {
  createExerciseSchema,
  progressIdSchema,
  progressRangeSchema,
  updateExerciseSchema,
  type ExerciseLog,
} from '@lean/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { exerciseLogs as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';

export const exercise = new Hono<AppEnv>();
const owned = (userId: string, id: string) => and(eq(table.userId, userId), eq(table.id, id));
const notFound = () => new AppError(404, 'not_found', 'Ejercicio no encontrado');
const serialize = (row: typeof table.$inferSelect): ExerciseLog => ({
  id: row.id,
  date: row.date,
  activity: row.activity,
  minutes: row.minutes,
  kcal: row.kcal,
});
exercise.get('/', validate('query', progressRangeSchema), async (c) => {
  const { from, to } = c.req.valid('query');
  const rows = await getDb(c.env)
    .select()
    .from(table)
    .where(and(eq(table.userId, c.get('userId')), gte(table.date, from), lte(table.date, to)))
    .orderBy(asc(table.date), asc(table.createdAt), asc(table.id));
  return c.json({ logs: rows.map(serialize) });
});
exercise.post('/', validate('json', createExerciseSchema), async (c) => {
  const [row] = await getDb(c.env)
    .insert(table)
    .values({ ...c.req.valid('json'), userId: c.get('userId') })
    .returning();
  if (!row) throw notFound();
  return c.json(serialize(row), 201);
});
exercise.patch(
  '/:id',
  validate('param', progressIdSchema),
  validate('json', updateExerciseSchema),
  async (c) => {
    const [row] = await getDb(c.env)
      .update(table)
      .set(c.req.valid('json'))
      .where(owned(c.get('userId'), c.req.valid('param').id))
      .returning();
    if (!row) throw notFound();
    return c.json(serialize(row));
  },
);
exercise.delete('/:id', validate('param', progressIdSchema), async (c) => {
  const [row] = await getDb(c.env)
    .delete(table)
    .where(owned(c.get('userId'), c.req.valid('param').id))
    .returning({ id: table.id });
  if (!row) throw notFound();
  return c.body(null, 204);
});
