import {
  createShoppingItemSchema,
  generateShoppingSchema,
  isoWeekRange,
  shoppingWeekQuerySchema,
  updateShoppingItemSchema,
  type ShoppingItem,
} from '@lean/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, type Db } from '../db/client';
import { foods, shoppingItems as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';

export const shopping = new Hono<AppEnv>();
const idSchema = z.object({ id: z.uuid({ error: 'Identificador inválido' }) });
const owned = (id: string, userId: string) => and(eq(table.id, id), eq(table.userId, userId));
const notFound = () => new AppError(404, 'not_found', 'Ítem no encontrado');
async function selectItems(db: Db, userId: string, weekStart: string) {
  return db
    .select({ item: table, name: foods.name, brand: foods.brand })
    .from(table)
    .leftJoin(foods, eq(table.foodId, foods.id))
    .where(and(eq(table.userId, userId), eq(table.weekStart, weekStart)))
    .orderBy(
      asc(sql`${table.foodId} IS NULL`),
      asc(
        sql`CASE WHEN ${table.foodId} IS NOT NULL THEN lower(${foods.name} || CASE WHEN ${foods.brand} IS NOT NULL AND ${foods.brand} <> '' THEN ' · ' || ${foods.brand} ELSE '' END) END`,
      ),
      asc(table.createdAt),
      asc(table.id),
    );
}
function serializeItem({
  item,
  name,
  brand,
}: Awaited<ReturnType<typeof selectItems>>[number]): ShoppingItem {
  return {
    id: item.id,
    foodId: item.foodId,
    label: item.foodId === null ? item.text! : `${name}${brand ? ` · ${brand}` : ''}`,
    totalGrams: item.grams === null ? null : Number(item.grams),
    checked: item.purchased,
    manual: item.foodId === null,
  };
}
async function listItems(db: Db, userId: string, weekStart: string) {
  return (await selectItems(db, userId, weekStart)).map(serializeItem);
}
shopping.get('/', validate('query', shoppingWeekQuerySchema), async (c) =>
  c.json(
    await listItems(getDb(c.env), c.get('userId'), isoWeekRange(c.req.valid('query').week).from),
  ),
);
shopping.post('/generate', validate('json', generateShoppingSchema), async (c) => {
  const db = getDb(c.env),
    userId = c.get('userId');
  const { from, to } = isoWeekRange(c.req.valid('json').week);
  // Lock in a separate statement so regeneration gets a fresh snapshot after waiting.
  // Materialized inputs share that snapshot across all three mutations.
  await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(4, hashtext(${userId + ':' + from}))`),
    db.execute(sql`
      WITH plan AS MATERIALIZED (
        SELECT food_id, sum(grams) AS grams
        FROM meal_entries
        WHERE user_id = ${userId}
          AND date BETWEEN ${from}::date AND ${to}::date
          AND status = 'planned'
        GROUP BY food_id
      ), existing AS MATERIALIZED (
        SELECT food_id, min(id::text)::uuid AS id, array_agg(id) FILTER (WHERE purchased) AS purchased_ids
        FROM shopping_items
        WHERE user_id = ${userId} AND week_start = ${from}::date AND food_id IS NOT NULL
        GROUP BY food_id
      ), updated AS (
        UPDATE shopping_items AS item
        SET grams = plan.grams,
          purchased = item.purchased OR EXISTS (
            SELECT 1 FROM unnest(existing.purchased_ids) AS duplicate(id)
            WHERE duplicate.id <> item.id
          ),
          text = NULL, updated_at = now()
        FROM plan JOIN existing USING (food_id)
        WHERE item.id = existing.id AND item.user_id = ${userId}
          AND item.week_start = ${from}::date
        RETURNING item.id
      ), deleted AS (
        DELETE FROM shopping_items AS item
        WHERE item.user_id = ${userId} AND item.week_start = ${from}::date
          AND item.food_id IS NOT NULL
          AND (
            NOT EXISTS (SELECT 1 FROM plan WHERE plan.food_id = item.food_id)
            OR item.id <> (SELECT existing.id FROM existing WHERE existing.food_id = item.food_id)
          )
        RETURNING item.id
      )
      INSERT INTO shopping_items (user_id, week_start, food_id, grams, purchased)
      SELECT ${userId}::uuid, ${from}::date, plan.food_id, plan.grams, false
      FROM plan
      WHERE NOT EXISTS (SELECT 1 FROM existing WHERE existing.food_id = plan.food_id)
    `),
  ]);
  return c.json(await listItems(db, userId, from));
});
shopping.post('/', validate('json', createShoppingItemSchema), async (c) => {
  const input = c.req.valid('json'),
    db = getDb(c.env),
    userId = c.get('userId');
  const [item] = await db
    .insert(table)
    .values({
      userId,
      weekStart: isoWeekRange(input.week).from,
      text: input.label,
      grams: input.quantity === undefined ? null : String(input.quantity),
    })
    .returning();
  if (!item) throw notFound();
  return c.json(serializeItem({ item, name: null, brand: null }), 201);
});
shopping.patch(
  '/:id',
  validate('param', idSchema),
  validate('json', updateShoppingItemSchema),
  async (c) => {
    const input = c.req.valid('json'),
      db = getDb(c.env),
      userId = c.get('userId'),
      id = c.req.valid('param').id;
    const [original] = await db.select().from(table).where(owned(id, userId));
    if (!original) throw notFound();
    if (original.foodId !== null && (input.label !== undefined || input.quantity !== undefined))
      throw new AppError(
        400,
        'validation_error',
        'Solo se pueden editar los ítems agregados a mano',
      );
    const [item] = await db
      .update(table)
      .set({
        purchased: input.checked,
        text: input.label,
        grams:
          input.quantity === undefined
            ? undefined
            : input.quantity === null
              ? null
              : String(input.quantity),
        updatedAt: new Date(),
      })
      .where(owned(id, userId))
      .returning();
    if (!item) throw notFound();
    const result = (await listItems(db, userId, item.weekStart)).find((row) => row.id === id);
    if (!result) throw notFound();
    return c.json(result);
  },
);
shopping.delete('/checked', validate('query', shoppingWeekQuerySchema), async (c) => {
  await getDb(c.env)
    .delete(table)
    .where(
      and(
        eq(table.userId, c.get('userId')),
        eq(table.weekStart, isoWeekRange(c.req.valid('query').week).from),
        eq(table.purchased, true),
      ),
    );
  return c.body(null, 204);
});
shopping.delete('/:id', validate('param', idSchema), async (c) => {
  const [item] = await getDb(c.env)
    .delete(table)
    .where(owned(c.req.valid('param').id, c.get('userId')))
    .returning({ id: table.id });
  if (!item) throw notFound();
  return c.body(null, 204);
});
