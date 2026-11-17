import { DEFAULT_TIME_ZONE, TEXT_LOG_DAILY_LIMIT } from '@lean/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { profiles, textLogUsage } from '../../db/schema';
import type { AiResult } from './openRouter';

function dailyWhere(userId: string, timeZone?: string) {
  const zone = sql`COALESCE(${timeZone ?? null}::text, (SELECT ${profiles.timeZone} FROM ${profiles} WHERE ${profiles.userId} = ${userId}), ${DEFAULT_TIME_ZONE})`;
  const start = sql`date_trunc('day', now() AT TIME ZONE ${zone})`;
  return and(
    eq(textLogUsage.userId, userId),
    sql`${textLogUsage.createdAt} >= (${start} AT TIME ZONE ${zone})`,
    sql`${textLogUsage.createdAt} < ((${start} + interval '1 day') AT TIME ZONE ${zone})`,
  );
}

export type AiReservation =
  { reserved: true; usageId: string; usedToday: number } | { reserved: false; usedToday: number };

export async function reserveAiUse(
  db: Db,
  userId: string,
  timeZone?: string,
): Promise<AiReservation> {
  const usageId = crypto.randomUUID();
  const where = dailyWhere(userId, timeZone);
  // Remove a rejected reservation before releasing the lock, so another waiter
  // cannot count a row that is about to be deleted.
  const [, , counts] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(6, hashtext(${userId}))`),
    db.insert(textLogUsage).values({ id: usageId, userId, outcome: 'provider_error', attempts: 0 }),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(textLogUsage)
      .where(where),
    db
      .delete(textLogUsage)
      .where(
        and(
          eq(textLogUsage.id, usageId),
          sql`(SELECT count(*) FROM ${textLogUsage} WHERE ${where}) > ${TEXT_LOG_DAILY_LIMIT}`,
        ),
      ),
  ]);
  const usedToday = counts[0]?.count;
  if (usedToday === undefined) throw new Error('No se pudo reservar el cupo de IA');
  return usedToday > TEXT_LOG_DAILY_LIMIT
    ? { reserved: false, usedToday: usedToday - 1 }
    : { reserved: true, usageId, usedToday };
}

export async function finishAiUse(db: Db, usageId: string, result: AiResult): Promise<void> {
  await db
    .update(textLogUsage)
    .set({
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      attempts: result.attempts,
      outcome: result.ok ? 'ok' : result.outcome,
    })
    .where(eq(textLogUsage.id, usageId));
}

export async function remainingToday(
  db: Db,
  userId: string,
  timeZone: string | undefined,
  freeRemaining: number | null,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(textLogUsage)
    .where(dailyWhere(userId, timeZone));
  return Math.max(
    0,
    Math.min(TEXT_LOG_DAILY_LIMIT - (row?.count ?? 0), freeRemaining ?? TEXT_LOG_DAILY_LIMIT),
  );
}
