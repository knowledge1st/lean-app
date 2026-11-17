import {
  parseMealTextSchema,
  createEntriesBatchSchema,
  type AiMealParse,
  type ParseMealTextResponse,
} from '@lean/shared';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { foods, profiles, mealEntries as table, textLogUsage } from '../db/schema';
import type { AppEnv } from '../env';
import { foodEntryMacros, serializeEntry } from '../lib/entryMacros';
import { AppError } from '../lib/errors';
import { validate } from '../lib/validate';
import { buildCatalog } from '../lib/textLog/catalog';
import { buildPrompt } from '../lib/textLog/prompt';
import { parseWithRules } from '../lib/textLog/rules';
import { mapItems } from '../lib/textLog/mapping';
import { interpretWithAi } from '../lib/textLog/openRouter';
import { savedModels, type TextLogDeps } from '../lib/textLog/freeModels';
import { reserveAiUse, finishAiUse, remainingToday } from '../lib/textLog/quota';
import { completeTask } from '../lib/textLog/tasks';

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
    let waitUntil: TextLogDeps['waitUntil'];
    try {
      const executionCtx = c.executionCtx;
      waitUntil = (task) => executionCtx.waitUntil(task);
    } catch {
      // Hono tests and local callers may have no Worker execution context.
    }
    const deps = {
      db,
      env: c.env,
      ...(waitUntil ? { waitUntil } : {}),
      ...(network ? { fetch: network } : {}),
    };
    let parse: AiMealParse | undefined;
    let interpreter: ParseMealTextResponse['interpreter'] = 'rules';
    let catalog: Awaited<ReturnType<typeof buildCatalog>> = [];
    if (c.env.OPENROUTER_API_KEY) {
      let usageId: string | undefined;
      const result = await interpretWithAi(deps, async (signal) => {
        // Discovery happens inside interpretWithAi, before reserving personal quota.
        const reservation = await reserveAiUse(db, userId, profile?.timeZone);
        if (!reservation.reserved) return null;
        if (signal.aborted) {
          // A reservation that finished after the deadline must also be released.
          await db.delete(textLogUsage).where(eq(textLogUsage.id, reservation.usageId));
          return null;
        }
        usageId = reservation.usageId;
        catalog = await buildCatalog(db, userId);
        return signal.aborted ? null : { ...buildPrompt(catalog), user: input.text };
      });
      if (usageId) {
        if (result.attempts === 0) {
          await completeTask(deps, db.delete(textLogUsage).where(eq(textLogUsage.id, usageId)));
        } else {
          await completeTask(deps, finishAiUse(db, usageId, result));
        }
      }
      if (result.ok && result.parse.items.length) {
        parse = result.parse;
        interpreter = 'ai';
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
      items: await mapItems(db, userId, parse, catalog, input.defaultMeal, interpreter),
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
      return {
        ...item,
        id: crypto.randomUUID(),
        userId,
        date: input.date,
        status: input.status,
        grams: String(item.grams),
        ...foodEntryMacros(food, item.grams),
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
