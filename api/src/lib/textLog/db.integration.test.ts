import { DEFAULT_TIME_ZONE, TEXT_LOG_DAILY_LIMIT } from '@lean/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  getTestDb,
  hasTestDatabase,
} from '../../../test/helpers/db';
import type { Db } from '../../db/client';
import { profiles, textLogModelHealth, textLogUsage } from '../../db/schema';
import { degradedModels, recordFailure, recordSuccess } from './health';
import { finishAiUse, remainingToday, reserveAiUse } from './quota';

describe.skipIf(!hasTestDatabase)('text log quota and health', () => {
  let db: Db;
  let userIds: string[];
  let models: string[];
  beforeEach(() => {
    db = getTestDb();
    userIds = [];
    models = [];
  });
  afterEach(async () => {
    if (models.length)
      await db.delete(textLogModelHealth).where(inArray(textLogModelHealth.model, models));
    for (const id of userIds) await deleteTestUser(db, id);
  });
  const user = async () => {
    const { user } = await createTestUser(db);
    userIds.push(user.id);
    return user.id;
  };
  const seedUses = async (userId: string, count: number) => {
    await db
      .insert(textLogUsage)
      .values(Array.from({ length: count }, () => ({ userId, outcome: 'provider_error' })));
  };

  it('refuses the 21st reservation, keeps failures charged, and isolates A from B', async () => {
    const a = await user();
    const b = await user();
    await seedUses(a, TEXT_LOG_DAILY_LIMIT - 1);
    const last = await reserveAiUse(db, a, DEFAULT_TIME_ZONE);
    expect(last.reserved).toBe(true);
    if (!last.reserved) throw new Error('Expected reservation');
    await finishAiUse(db, last.usageId, {
      ok: false,
      outcome: 'timeout',
      model: null,
      promptTokens: 5,
      completionTokens: 2,
      attempts: 1,
    });
    expect(await reserveAiUse(db, a, DEFAULT_TIME_ZONE)).toEqual({
      reserved: false,
      usedToday: 20,
    });
    expect(await remainingToday(db, a, DEFAULT_TIME_ZONE, null)).toBe(0);
    expect(await remainingToday(db, b, DEFAULT_TIME_ZONE, 7)).toBe(7);
    expect(await reserveAiUse(db, b, DEFAULT_TIME_ZONE)).toMatchObject({
      reserved: true,
      usedToday: 1,
    });
    const [row] = await db.select().from(textLogUsage).where(eq(textLogUsage.id, last.usageId));
    expect(row).toMatchObject({
      outcome: 'timeout',
      promptTokens: 5,
      completionTokens: 2,
      attempts: 1,
    });
    expect(await remainingToday(db, b, DEFAULT_TIME_ZONE, 0)).toBe(0);
    expect(await remainingToday(db, b, DEFAULT_TIME_ZONE, -2)).toBe(0);
  });

  it('admits only one concurrent reservation at the limit and deletes rejected rows atomically', async () => {
    const a = await user();
    await seedUses(a, TEXT_LOG_DAILY_LIMIT - 1);
    const results = await Promise.all([reserveAiUse(db, a), reserveAiUse(db, a)]);
    expect(results.filter((r) => r.reserved)).toHaveLength(1);
    expect(await db.select().from(textLogUsage).where(eq(textLogUsage.userId, a))).toHaveLength(20);
  });

  it('counts local days with profile zone and defaults, excluding yesterday and tomorrow', async () => {
    const a = await user();
    await db.insert(profiles).values({ userId: a, timeZone: 'Pacific/Kiritimati' });
    await db.insert(textLogUsage).values([
      {
        userId: a,
        outcome: 'ok',
        createdAt: sql`(date_trunc('day', now() AT TIME ZONE 'Pacific/Kiritimati') - interval '1 second') AT TIME ZONE 'Pacific/Kiritimati'`,
      },
      {
        userId: a,
        outcome: 'ok',
        createdAt: sql`(date_trunc('day', now() AT TIME ZONE 'Pacific/Kiritimati') + interval '1 day') AT TIME ZONE 'Pacific/Kiritimati'`,
      },
    ]);
    expect(await reserveAiUse(db, a)).toMatchObject({ reserved: true, usedToday: 1 });
    expect(await remainingToday(db, a, undefined, null)).toBe(19);
  });

  it('degrades after three failures within 24h, expires and recovers on success', async () => {
    const model = `test/${crypto.randomUUID()}:free`;
    models.push(model);
    const now = new Date('2026-11-17T12:00:00Z');
    await recordFailure(db, model, now);
    await recordFailure(db, model, now);
    expect(await degradedModels(db, now)).not.toContain(model);
    await recordFailure(db, model, now);
    expect(await degradedModels(db, now)).toContain(model);
    expect(await degradedModels(db, new Date(now.getTime() + 86_400_001))).not.toContain(model);
    await recordSuccess(db, model);
    expect(await degradedModels(db, now)).not.toContain(model);
    const [row] = await db
      .select()
      .from(textLogModelHealth)
      .where(eq(textLogModelHealth.model, model));
    expect(row).toMatchObject({ failures: 0, lastFailureAt: null, degradedUntil: null });
  });

  it('restarts the failure count when the last failure is more than 24h old', async () => {
    const model = `test/${crypto.randomUUID()}:free`;
    models.push(model);
    const old = new Date('2026-11-15T12:00:00Z');
    await recordFailure(db, model, old);
    await recordFailure(db, model, old);
    await recordFailure(db, model, new Date('2026-11-17T12:00:00Z'));
    const [row] = await db
      .select()
      .from(textLogModelHealth)
      .where(eq(textLogModelHealth.model, model));
    expect(row).toMatchObject({ failures: 1, degradedUntil: null });
  });
});
