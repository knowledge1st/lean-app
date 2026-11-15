import {
  barcodeSchema,
  createFoodSchema,
  foodListQuerySchema,
  foodSearchQuerySchema,
  importFoodSchema,
  updateFoodSchema,
  type CreateFood,
  type Food,
} from '@lean/shared';
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, type Db } from '../db/client';
import { foods as table, mealEntries, type Food as FoodRow } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { fetchProduct, OffUnavailableError, searchProducts } from '../lib/openFoodFacts';
import { validate } from '../lib/validate';

export const foods = new Hono<AppEnv>();
const visible = (userId: string) => or(ne(table.source, 'custom'), eq(table.ownerId, userId));
const owned = (id: string, userId: string) =>
  and(eq(table.id, id), eq(table.source, 'custom'), eq(table.ownerId, userId));
const notFound = () => new AppError(404, 'not_found', 'Alimento no encontrado');
const conflict = () => new AppError(409, 'conflict', 'Ya tenés un alimento con ese código');
const serialize = (row: FoodRow): Food => ({
  id: row.id,
  source: row.source,
  name: row.name,
  brand: row.brand,
  barcode: row.barcode,
  kcal: row.kcalPer100g,
  protein: Number(row.proteinPer100g),
  carbs: Number(row.carbsPer100g),
  fat: Number(row.fatPer100g),
  servingG: row.servingGrams === null ? null : Number(row.servingGrams),
  servingLabel: row.servingLabel,
});
const values = (input: CreateFood) => ({
  name: input.name,
  brand: input.brand ?? null,
  barcode: input.barcode ?? null,
  kcalPer100g: input.kcal,
  proteinPer100g: String(input.protein),
  carbsPer100g: String(input.carbs),
  fatPer100g: String(input.fat),
  servingGrams: input.servingG == null ? null : String(input.servingG),
  servingLabel: input.servingLabel ?? null,
});
const pgCode = (error: unknown, code: string): boolean => {
  if (!error || typeof error !== 'object') return false;
  return (
    ('code' in error && error.code === code) || ('cause' in error && pgCode(error.cause, code))
  );
};
async function resolveBarcode(db: Db, barcode: string, userId?: string): Promise<Food> {
  const lookup = async () =>
    db
      .select()
      .from(table)
      .where(
        and(
          eq(table.barcode, barcode),
          userId === undefined ? inArray(table.source, ['off', 'seed']) : visible(userId),
        ),
      )
      .orderBy(sql`CASE WHEN ${table.source} = 'custom' THEN 0 ELSE 1 END`)
      .limit(1);
  const [existing] = await lookup();
  if (existing) return serialize(existing);
  let product;
  try {
    product = await fetchProduct(barcode);
  } catch (error) {
    if (error instanceof OffUnavailableError)
      throw new AppError(503, 'off_unavailable', 'No se pudo consultar Open Food Facts');
    throw error;
  }
  if (!product || product.barcode !== barcode)
    throw new AppError(404, 'not_found', 'Producto no encontrado');
  await db
    .insert(table)
    .values({
      ...values({
        ...product,
        brand: product.brand ?? undefined,
        servingG: product.servingG ?? undefined,
        servingLabel: product.servingLabel ?? undefined,
      }),
      source: 'off',
    })
    .onConflictDoNothing({
      target: table.barcode,
      where: sql`${table.barcode} IS NOT NULL AND ${table.source} <> 'custom'`,
    });
  const [saved] = await lookup();
  if (!saved) throw new AppError(404, 'not_found', 'Producto no encontrado');
  return serialize(saved);
}
const normalized = (value: SQL) => sql`translate(lower(${value}), 'áéíóúüñ', 'aeiouun')`;
foods.get('/search', validate('query', foodSearchQuerySchema), async (c) => {
  const { q, limit } = c.req.valid('query');
  const db = getDb(c.env),
    userId = c.get('userId');
  const query = normalized(sql`${q}`),
    name = normalized(sql`${table.name}`),
    brand = normalized(sql`coalesce(${table.brand}, '')`);
  const score = sql`greatest(word_similarity(${query}, ${name}), word_similarity(${query}, ${brand}))`;
  // Los límites de palabra evitan que el prefijo «pol» empate «Polenta» con «Pollo» para «polo».
  const wordScore = sql`greatest(strict_word_similarity(${query}, ${name}), strict_word_similarity(${query}, ${brand}))`;
  const used = sql`exists(select 1 from ${mealEntries} where ${mealEntries.foodId} = ${table.id} and ${mealEntries.userId} = ${userId})`;
  const local = await db
    .select()
    .from(table)
    .where(and(visible(userId), sql`(${score} >= 0.3 OR strpos(${name}, ${query}) > 0)`))
    .orderBy(desc(used), desc(wordScore), desc(sql`similarity(${query}, ${name})`), asc(table.name))
    .limit(Math.max(5, limit));
  const items = local.slice(0, limit).map(serialize);
  let offAvailable = true;
  if (local.length < 5 && q.length >= 3) {
    try {
      const external = await searchProducts(q, limit);
      const codes = external.map((p) => p.barcode);
      const stored = codes.length
        ? await db
            .select()
            .from(table)
            .where(and(ne(table.source, 'custom'), inArray(table.barcode, codes)))
        : [];
      const storedByBarcode = new Map(stored.map((row) => [row.barcode, row]));
      const seen = new Set(items.map((item) => item.barcode));
      for (const product of external) {
        if (items.length >= limit) break;
        if (seen.has(product.barcode)) continue;
        seen.add(product.barcode);
        const saved = storedByBarcode.get(product.barcode);
        items.push(saved ? serialize(saved) : { ...product, id: null, source: 'off' });
      }
    } catch (error) {
      if (error instanceof OffUnavailableError) offAvailable = false;
      else throw error;
    }
  }
  return c.json({ items, offAvailable });
});
foods.get('/barcode/:code', validate('param', z.object({ code: barcodeSchema })), async (c) =>
  c.json(await resolveBarcode(getDb(c.env), c.req.valid('param').code, c.get('userId'))),
);
foods.post('/import', validate('json', importFoodSchema), async (c) =>
  c.json(await resolveBarcode(getDb(c.env), c.req.valid('json').barcode)),
);
for (const kind of ['recent', 'frequent'] as const) {
  foods.get(`/${kind}`, validate('query', foodListQuerySchema), async (c) => {
    const last = sql`max(${mealEntries.createdAt})`;
    const rows = await getDb(c.env)
      .select({ food: table })
      .from(table)
      .innerJoin(mealEntries, eq(mealEntries.foodId, table.id))
      .where(
        and(
          visible(c.get('userId')),
          eq(mealEntries.userId, c.get('userId')),
          kind === 'frequent'
            ? sql`${mealEntries.date} >= current_date - 60 AND ${mealEntries.date} <= current_date`
            : undefined,
        ),
      )
      .groupBy(table.id)
      .orderBy(
        ...(kind === 'frequent' ? [desc(sql`count(*)`), desc(last)] : [desc(last)]),
        asc(table.id),
      )
      .limit(c.req.valid('query').limit);
    return c.json(rows.map((r) => serialize(r.food)));
  });
}
foods.post('/', validate('json', createFoodSchema), async (c) => {
  try {
    const [row] = await getDb(c.env)
      .insert(table)
      .values({ ...values(c.req.valid('json')), source: 'custom', ownerId: c.get('userId') })
      .returning();
    if (!row) throw notFound();
    return c.json(serialize(row), 201);
  } catch (error) {
    if (pgCode(error, '23505')) throw conflict();
    throw error;
  }
});
const idSchema = z.object({ id: z.uuid({ error: 'Identificador inválido' }) });
foods.patch('/:id', validate('param', idSchema), validate('json', updateFoodSchema), async (c) => {
  const db = getDb(c.env),
    condition = owned(c.req.valid('param').id, c.get('userId'));
  const [current] = await db.select().from(table).where(condition);
  if (!current) throw notFound();
  const merged = {
    ...serialize(current),
    ...Object.fromEntries(Object.entries(c.req.valid('json')).filter(([, v]) => v !== undefined)),
  };
  const parsed = createFoodSchema.safeParse({
    ...merged,
    brand: merged.brand ?? undefined,
    barcode: merged.barcode ?? undefined,
    servingG: merged.servingG ?? undefined,
    servingLabel: merged.servingLabel ?? undefined,
  });
  if (!parsed.success)
    throw new AppError(
      400,
      'validation_error',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
  try {
    const [row] = await db
      .update(table)
      .set({ ...values(parsed.data), updatedAt: new Date() })
      .where(condition)
      .returning();
    if (!row) throw notFound();
    return c.json(serialize(row));
  } catch (error) {
    if (pgCode(error, '23505')) throw conflict();
    throw error;
  }
});
foods.delete('/:id', validate('param', idSchema), async (c) => {
  try {
    const [row] = await getDb(c.env)
      .delete(table)
      .where(owned(c.req.valid('param').id, c.get('userId')))
      .returning({ id: table.id });
    if (!row) throw notFound();
    return c.body(null, 204);
  } catch (error) {
    // ON DELETE RESTRICT can report 23001 instead of the usual foreign-key violation 23503.
    if (pgCode(error, '23001') || pgCode(error, '23503'))
      throw new AppError(409, 'food_in_use', 'El alimento está en uso en tu diario');
    throw error;
  }
});
