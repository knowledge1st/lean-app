import {
  addDays,
  copyEntriesSchema,
  isoWeekRange,
  markEatenSchema,
  MEALS,
  weekdayIndex,
  createEntrySchema,
  entriesQuerySchema,
  updateEntrySchema,
  type Entry,
} from '@lean/shared';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, type Db } from '../db/client';
import { foods, mealEntries as table } from '../db/schema';
import type { AppEnv } from '../env';
import { foodEntryMacros, serializeEntry } from '../lib/entryMacros';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';
import { createTextLogEntryRoutes } from './entriesTextLog';

export { serializeEntry, storedMacros } from '../lib/entryMacros';

export const entries = new Hono<AppEnv>();
const notFound = () => new AppError(404, 'not_found', 'Entrada no encontrada');
const idSchema = z.object({ id: z.uuid({ error: 'Identificador inválido' }) });
const owned = (id: string, userId: string) => and(eq(table.id, id), eq(table.userId, userId));
export async function selectEntries(
  db: Db,
  userId: string,
  from?: string,
  to?: string,
  id?: string,
  meal?: Entry['meal'],
) {
  return (
    db
      .select({ entry: table, food: foods })
      .from(table)
      .innerJoin(foods, eq(table.foodId, foods.id))
      .where(
        and(
          eq(table.userId, userId),
          from ? gte(table.date, from) : undefined,
          to ? lte(table.date, to) : undefined,
          id ? eq(table.id, id) : undefined,
          meal ? eq(table.meal, meal) : undefined,
        ),
      )
      // PostgreSQL enum ordering matches MEALS.
      .orderBy(asc(table.date), asc(table.meal), asc(table.createdAt), asc(table.id))
  );
}
entries.get('/', validate('query', entriesQuerySchema), async (c) => {
  const { from, to } = c.req.valid('query');
  return c.json((await selectEntries(getDb(c.env), c.get('userId'), from, to)).map(serializeEntry));
});
entries.post('/', validate('json', createEntrySchema), async (c) => {
  const input = c.req.valid('json'),
    db = getDb(c.env),
    userId = c.get('userId');
  const [food] = await db.select().from(foods).where(eq(foods.id, input.foodId));
  if (!food) throw new AppError(404, 'not_found', 'Alimento no encontrado');
  const [entry] = await db
    .insert(table)
    .values({
      ...input,
      userId,
      grams: String(input.grams),
      ...foodEntryMacros(food, input.grams),
    })
    .returning();
  if (!entry) throw notFound();
  return c.json(serializeEntry({ entry, food }), 201);
});
entries.post('/copy', validate('json', copyEntriesSchema), async (c) => {
  const input = c.req.valid('json'),
    db = getDb(c.env),
    userId = c.get('userId');
  const source =
    input.scope === 'week' ? isoWeekRange(input.from) : { from: input.from, to: input.from };
  const target = input.scope === 'week' ? isoWeekRange(input.to) : { from: input.to, to: input.to };
  const rows = await selectEntries(
    db,
    userId,
    source.from,
    source.to,
    undefined,
    input.scope === 'meal' ? input.meal : undefined,
  );
  const baseCreatedAt = Date.now();
  const values = rows.map(({ entry }, index) => ({
    createdAt: new Date(baseCreatedAt + index),
    id: crypto.randomUUID(),
    userId,
    date: input.scope === 'week' ? addDays(target.from, weekdayIndex(entry.date)) : target.from,
    meal: entry.meal,
    foodId: entry.foodId,
    grams: entry.grams,
    status: input.scope === 'meal' ? input.status : ('planned' as const),
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
  }));
  const deletion = db
    .delete(table)
    .where(
      and(
        eq(table.userId, userId),
        gte(table.date, target.from),
        lte(table.date, target.to),
        eq(table.status, 'planned'),
      ),
    );
  let created: (typeof table.$inferSelect)[] = [];
  if (input.scope !== 'meal' && input.mode === 'replace') {
    // The DELETE needs a fresh snapshot after any competing replacement commits.
    const result = await db.batch([
      db.execute(sql`SELECT pg_advisory_xact_lock(5, hashtext(${userId}))`),
      deletion,
      ...(values.length ? [db.insert(table).values(values).returning()] : []),
    ]);
    created = result[2] ?? [];
  } else if (values.length) {
    [created] = await db.batch([db.insert(table).values(values).returning()]);
  }
  const foodById = new Map(rows.map(({ food }) => [food.id, food]));
  created.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return c.json(
    created.map((entry) => serializeEntry({ entry, food: foodById.get(entry.foodId)! })),
    201,
  );
});
entries.post('/mark-eaten', validate('json', markEatenSchema), async (c) => {
  const { date, meal } = c.req.valid('json'),
    db = getDb(c.env),
    userId = c.get('userId');
  const changed = await db
    .update(table)
    .set({ status: 'eaten', updatedAt: new Date() })
    .where(
      and(
        eq(table.userId, userId),
        eq(table.date, date),
        eq(table.status, 'planned'),
        meal ? eq(table.meal, meal) : undefined,
      ),
    )
    .returning({ id: table.id });
  if (!changed.length) return c.json([]);
  const rows = await db
    .select({ entry: table, food: foods })
    .from(table)
    .innerJoin(foods, eq(table.foodId, foods.id))
    .where(
      and(
        eq(table.userId, userId),
        inArray(
          table.id,
          changed.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(table.date), asc(table.meal), asc(table.createdAt), asc(table.id));
  return c.json(rows.map(serializeEntry));
});
entries.patch(
  '/:id',
  validate('param', idSchema),
  validate('json', updateEntrySchema),
  async (c) => {
    const { grams, ...input } = c.req.valid('json'),
      db = getDb(c.env),
      userId = c.get('userId');
    const id = c.req.valid('param').id;
    // Every expression uses the row locked by this UPDATE, including its previous grams.
    const scaled =
      grams === undefined
        ? {}
        : {
            grams: String(grams),
            kcal: sql`round(${table.kcal} * ${String(grams)}::numeric / ${table.grams}, 4)`,
            protein: sql`round(${table.protein} * ${String(grams)}::numeric / ${table.grams}, 4)`,
            carbs: sql`round(${table.carbs} * ${String(grams)}::numeric / ${table.grams}, 4)`,
            fat: sql`round(${table.fat} * ${String(grams)}::numeric / ${table.grams}, 4)`,
          };
    const [updated] = await db
      .update(table)
      .set({ ...input, ...scaled, updatedAt: new Date() })
      .where(owned(id, userId))
      .returning({ id: table.id });
    if (!updated) throw notFound();
    const [row] = await selectEntries(db, userId, undefined, undefined, id);
    if (!row) throw notFound();
    return c.json(serializeEntry(row));
  },
);
entries.delete('/:id', validate('param', idSchema), async (c) => {
  const [row] = await getDb(c.env)
    .delete(table)
    .where(owned(c.req.valid('param').id, c.get('userId')))
    .returning({ id: table.id });
  if (!row) throw notFound();
  return c.body(null, 204);
});

entries.route('/', createTextLogEntryRoutes());
