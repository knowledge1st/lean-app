import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';

export const health = new Hono<AppEnv>()
  .get('/', (c) => c.json({ ok: true }))
  .get('/db', async (c) => {
    await getDb(c.env).execute(sql`select 1`);
    return c.json({ ok: true });
  });
