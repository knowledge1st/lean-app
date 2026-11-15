import {
  createEntrySchema,
  entriesQuerySchema,
  macrosForGrams,
  roundMacros,
  updateEntrySchema,
  type Entry,
  type Macros,
} from '@lean/shared';
import { and, asc, eq, gte, lte, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, type Db } from '../db/client';
import { foods, mealEntries as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';

export const entries = new Hono<AppEnv>();
// Correct binary floating-point noise at decimal ties before persisting four places.
const storageNumeric = (value: number) =>
  String(Math.round((value + Number.EPSILON * Math.abs(value)) * 10_000) / 10_000);
const notFound = () => new AppError(404, 'not_found', 'Entrada no encontrada');
const idSchema = z.object({ id: z.uuid({ error: 'Identificador inválido' }) });
const owned = (id: string, userId: string) => and(eq(table.id, id), eq(table.userId, userId));
export const storedMacros = (row: {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}): Macros => ({
  kcal: Number(row.kcal),
  protein: Number(row.protein),
  carbs: Number(row.carbs),
  fat: Number(row.fat),
});
export async function selectEntries(
  db: Db,
  userId: string,
  from?: string,
  to?: string,
  id?: string,
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
        ),
      )
      // PostgreSQL enum ordering matches MEALS.
      .orderBy(asc(table.date), asc(table.meal), asc(table.createdAt), asc(table.id))
  );
}
export function serializeEntry({
  entry: row,
  food,
}: Awaited<ReturnType<typeof selectEntries>>[number]): Entry {
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    status: row.status,
    foodId: row.foodId,
    grams: Number(row.grams),
    ...roundMacros(storedMacros(row)),
    food: {
      id: food.id,
      source: food.source,
      name: food.name,
      brand: food.brand,
      servingG: food.servingGrams === null ? null : Number(food.servingGrams),
      servingLabel: food.servingLabel,
    },
    createdAt: row.createdAt.toISOString(),
  };
}
entries.get('/', validate('query', entriesQuerySchema), async (c) => {
  const { from, to } = c.req.valid('query');
  return c.json((await selectEntries(getDb(c.env), c.get('userId'), from, to)).map(serializeEntry));
});
entries.post('/', validate('json', createEntrySchema), async (c) => {
  const input = c.req.valid('json'),
    db = getDb(c.env),
    userId = c.get('userId');
  const [food] = await db
    .select()
    .from(foods)
    .where(
      and(eq(foods.id, input.foodId), or(ne(foods.source, 'custom'), eq(foods.ownerId, userId))),
    );
  if (!food) throw new AppError(404, 'not_found', 'Alimento no encontrado');
  const macros = macrosForGrams(
    {
      kcal: food.kcalPer100g,
      protein: Number(food.proteinPer100g),
      carbs: Number(food.carbsPer100g),
      fat: Number(food.fatPer100g),
    },
    input.grams,
  );
  const [entry] = await db
    .insert(table)
    .values({
      ...input,
      userId,
      grams: String(input.grams),
      kcal: storageNumeric(macros.kcal),
      protein: storageNumeric(macros.protein),
      carbs: storageNumeric(macros.carbs),
      fat: storageNumeric(macros.fat),
    })
    .returning();
  if (!entry) throw notFound();
  return c.json(serializeEntry({ entry, food }), 201);
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
