import type { Entry, Food, LoginResponse } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { foods, mealEntries, shoppingItems } from '../../src/db/schema';
import { app } from '../../src/index';
import { testEnv } from '../../src/test-env';
import { createTestUser, deleteTestUser, getTestDb, testDatabaseUrl } from './db';

export function diaryFixture() {
  const db = getTestDb();
  const accounts: Awaited<ReturnType<typeof createTestUser>>[] = [];
  const tokens: string[] = [];
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    user = 0,
    env: Partial<typeof testEnv> = {},
  ) =>
    app.request(
      `/api${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${tokens[user]}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { ...testEnv, ...env, DATABASE_URL: testDatabaseUrl()! },
    );
  return {
    db,
    accounts,
    request,
    async setup() {
      for (let i = 0; i < 2; i++) {
        const account = await createTestUser(db);
        accounts.push(account);
        const response = await app.request(
          '/api/auth/login',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CF-Connecting-IP': `test-diary-${crypto.randomUUID()}`,
            },
            body: JSON.stringify({ username: account.user.username, password: account.password }),
          },
          { ...testEnv, DATABASE_URL: testDatabaseUrl()! },
        );
        expect(response.status).toBe(200);
        tokens.push(((await response.json()) as LoginResponse).token);
      }
    },
    async cleanup() {
      // Remove RESTRICT references before deleting custom foods and users.
      for (const { user } of accounts)
        await db.delete(shoppingItems).where(eq(shoppingItems.userId, user.id));
      for (const { user } of accounts)
        await db.delete(mealEntries).where(eq(mealEntries.userId, user.id));
      for (const { user } of accounts) await db.delete(foods).where(eq(foods.ownerId, user.id));
      for (const { user } of accounts) await deleteTestUser(db, user.id);
    },
    async food(user = 0, patch: Record<string, unknown> = {}) {
      const response = await request(
        '/foods',
        'POST',
        { name: 'Diario test', kcal: 200, protein: 10.25, carbs: 20.5, fat: 3.15, ...patch },
        user,
      );
      expect(response.status).toBe(201);
      return (await response.json()) as Food;
    },
    async entry(foodId: string, patch: Record<string, unknown> = {}, user = 0) {
      const response = await request(
        '/entries',
        'POST',
        { foodId, date: '2026-11-14', meal: 'lunch', grams: 150, ...patch },
        user,
      );
      expect(response.status).toBe(201);
      return (await response.json()) as Entry;
    },
  };
}
