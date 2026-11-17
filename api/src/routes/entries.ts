import {
  addDays,
  parseMealTextSchema,
  createEntriesBatchSchema,
  type AiMealParse,
  type ParseMealTextResponse,
  copyEntriesSchema,
  isoWeekRange,
  markEatenSchema,
  MEALS,
  weekdayIndex,
  createEntrySchema,
  entriesQuerySchema,
  macrosForGrams,
  roundMacros,
  updateEntrySchema,
  type Entry,
  type Macros,
} from '@lean/shared';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, type Db } from '../db/client';
import { foods, profiles, mealEntries as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';
import { buildCatalog } from '../lib/textLog/catalog';
import { buildPrompt } from '../lib/textLog/prompt';
import { parseWithRules } from '../lib/textLog/rules';
import { mapItems } from '../lib/textLog/mapping';
import { interpretWithAi } from '../lib/textLog/openRouter';
import { getFreeModels, savedModels } from '../lib/textLog/freeModels';
import { reserveAiUse, finishAiUse, remainingToday } from '../lib/textLog/quota';

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
  const [food] = await db.select().from(foods).where(eq(foods.id, input.foodId));
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

// Tests can inject fetch while the application mounts these routes with global fetch.
export function createTextLogEntryRoutes(network?: typeof fetch) {
  const entries = new Hono<AppEnv>();
  entries.post('/parse-text', validate('json', parseMealTextSchema), async (c) => {
    const input = c.req.valid('json');
    const db = getDb(c.env);
    const userId = c.get('userId');
    const [profile] = await db
      .select({ timeZone: profiles.timeZone })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    const deps = { db, env: c.env, ...(network ? { fetch: network } : {}) };
    let parse: AiMealParse | undefined;
    let interpreter: ParseMealTextResponse['interpreter'] = 'rules';
    let catalog: Awaited<ReturnType<typeof buildCatalog>> = [];
    if (c.env.OPENROUTER_API_KEY) {
      // Discovery does not reserve personal quota. Known-unavailable AI goes directly to rules.
      const state = await getFreeModels(deps);
      if (state.candidates.length && state.freeRemaining !== 0) {
        const reservation = await reserveAiUse(db, userId, profile?.timeZone);
        if (reservation.reserved) {
          catalog = await buildCatalog(db, userId);
          const result = await interpretWithAi(deps, { ...buildPrompt(catalog), user: input.text });
          await finishAiUse(db, reservation.usageId, result);
          if (result.ok && result.parse.items.length) {
            parse = result.parse;
            interpreter = 'ai';
          }
        }
      }
    }
    parse ??= parseWithRules(input.text);
    if (!parse.items.length)
      throw new AppError(
        422,
        'text_not_understood',
        'No entendí qué comiste. Probá con otras palabras o cargá los alimentos a mano.',
      );
    const warnings =
      interpreter === 'rules' ? ['Interpretación simple: revisá con más cuidado.'] : [];
    if (parse.otherDayMentioned) warnings.push('Se van a cargar en el día que estás viendo');
    const state = await savedModels(db);
    const response: ParseMealTextResponse = {
      items: await mapItems(db, userId, parse, catalog, input.defaultMeal),
      warnings,
      interpreter,
      remainingToday: await remainingToday(db, userId, profile?.timeZone, state.freeRemaining),
    };
    return c.json(response);
  });
  entries.post('/batch', validate('json', createEntriesBatchSchema), async (c) => {
    const input = c.req.valid('json');
    const db = getDb(c.env);
    const userId = c.get('userId');
    const rows = await db
      .select()
      .from(foods)
      .where(
        inArray(
          foods.id,
          input.items.map((item) => item.foodId),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    if (input.items.some((item) => !byId.has(item.foodId)))
      throw new AppError(404, 'not_found', 'Alimento no encontrado');
    const values = input.items.map((item) => {
      const food = byId.get(item.foodId)!;
      const macros = macrosForGrams(
        {
          kcal: food.kcalPer100g,
          protein: Number(food.proteinPer100g),
          carbs: Number(food.carbsPer100g),
          fat: Number(food.fatPer100g),
        },
        item.grams,
      );
      return {
        ...item,
        id: crypto.randomUUID(),
        userId,
        date: input.date,
        status: input.status,
        grams: String(item.grams),
        kcal: storageNumeric(macros.kcal),
        protein: storageNumeric(macros.protein),
        carbs: storageNumeric(macros.carbs),
        fat: storageNumeric(macros.fat),
      };
    });
    const created = await db.insert(table).values(values).returning();
    const createdById = new Map(created.map((row) => [row.id, row]));
    return c.json(
      values.map((value) =>
        serializeEntry({ entry: createdById.get(value.id)!, food: byId.get(value.foodId)! }),
      ),
      201,
    );
  });
  return entries;
}

entries.route('/', createTextLogEntryRoutes());
