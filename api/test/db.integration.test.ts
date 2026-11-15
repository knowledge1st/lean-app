import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../src/db/schema';
import { app } from '../src/index';
import { testEnv } from '../src/test-env';
import {
  createTestUser,
  deleteTestUser,
  getTestDb,
  hasTestDatabase,
  testDatabaseUrl,
} from './helpers/db';

describe.skipIf(!hasTestDatabase)('database integration', () => {
  it('GET /api/health/db returns ok', async () => {
    const url = testDatabaseUrl();
    if (!url) throw new Error('DATABASE_URL is required');
    const res = await app.request('/api/health/db', {}, { ...testEnv, DATABASE_URL: url });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  }, 20_000);

  it('creates a user with a valid bcrypt hash and deletes it', async () => {
    const db = getTestDb();
    const { user, password } = await createTestUser(db);
    try {
      expect(password).toBe('test-password');
      const [storedUser] = await db
        .select({
          passwordMatches: sql<boolean>`crypt('test-password', ${users.passwordHash}) = ${users.passwordHash}`,
        })
        .from(users)
        .where(eq(users.id, user.id));
      expect(storedUser?.passwordMatches).toBe(true);
      await deleteTestUser(db, user.id);
      expect(await db.select().from(users).where(eq(users.id, user.id))).toEqual([]);
    } finally {
      await deleteTestUser(db, user.id);
    }
  }, 20_000);

  it('supports trigram similarity', async () => {
    const db = getTestDb();
    const result = await db.execute<{ positive: boolean }>(
      sql`select similarity('pollo', 'polo') > 0 as positive`,
    );
    expect(result.rows[0]?.positive).toBe(true);
  }, 20_000);
});
