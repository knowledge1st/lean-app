import { existsSync } from 'node:fs';
import { and, eq, like, sql } from 'drizzle-orm';
import { getDb, type Db } from '../../src/db/client';
import { users, type User } from '../../src/db/schema';

export function testDatabaseUrl(): string | undefined {
  const envFile = new URL('../../.dev.vars', import.meta.url);
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return process.env.DATABASE_URL || undefined;
}

export const hasTestDatabase = Boolean(testDatabaseUrl());

export function getTestDb(): Db {
  const url = testDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL is required for database integration tests');
  }
  return getDb({ DATABASE_URL: url });
}

export async function createTestUser(
  db: Db,
  opts: { password?: string; displayName?: string } = {},
): Promise<{ user: User; password: string }> {
  const password = opts.password ?? 'test-password';
  const [user] = await db
    .insert(users)
    .values({
      username: `test_${crypto.randomUUID().replaceAll('-', '')}`,
      passwordHash: sql`crypt(${password}, gen_salt('bf', 4))`,
      displayName: opts.displayName ?? 'Test User',
    })
    .returning();
  if (!user) {
    throw new Error('Test user insert returned no user');
  }
  return { user, password };
}

export async function deleteTestUser(db: Db, userId: string): Promise<void> {
  await db.delete(users).where(and(eq(users.id, userId), like(users.username, 'test\\_%')));
}

export async function deleteAllTestUsers(db: Db): Promise<void> {
  await db.delete(users).where(like(users.username, 'test\\_%'));
}
