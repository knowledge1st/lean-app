import {
  MEALS,
  roundMacros,
  sumMacros,
  summaryDayQuerySchema,
  type DaySummary,
  type EntryStatus,
} from '@lean/shared';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { getTargetForDate } from '../lib/targets';
import { validate } from '../lib/validate';
import { selectEntries, serializeEntry, storedMacros } from './entries';

export const summary = new Hono<AppEnv>();
summary.get('/day', validate('query', summaryDayQuerySchema), async (c) => {
  const { date } = c.req.valid('query'),
    db = getDb(c.env),
    userId = c.get('userId');
  const rows = await selectEntries(db, userId, date, date);
  const total = (items: typeof rows, status: EntryStatus) =>
    roundMacros(
      sumMacros(items.filter((r) => r.entry.status === status).map((r) => storedMacros(r.entry))),
    );
  const result: DaySummary = {
    date,
    eaten: total(rows, 'eaten'),
    planned: total(rows, 'planned'),
    meals: MEALS.map((meal) => {
      const items = rows.filter((r) => r.entry.meal === meal);
      return {
        meal,
        eaten: total(items, 'eaten'),
        planned: total(items, 'planned'),
        entries: items.map(serializeEntry),
      };
    }),
    target: await getTargetForDate(db, userId, date),
  };
  return c.json(result);
});
