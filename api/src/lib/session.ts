import { and, eq, gt, lt, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions } from '../db/schema';

export const SESSION_DURATION_DAYS = 30;
export const SESSION_REFRESH_HOURS = 1;
const expiresAt = sql`now() + ${SESSION_DURATION_DAYS} * interval '1 day'`;
const needsRefresh = sql`${sessions.lastUsedAt} < now() - ${SESSION_REFRESH_HOURS} * interval '1 hour'`;

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = generateToken();
  await db.insert(sessions).values({ userId, tokenHash: await hashToken(token), expiresAt });
  return token;
}

export async function resolveSession(db: Db, token: string) {
  const valid = and(
    eq(sessions.tokenHash, await hashToken(token)),
    gt(sessions.expiresAt, sql`now()`),
  );
  const [session] = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      needsRefresh: sql<boolean>`${needsRefresh}`,
    })
    .from(sessions)
    .where(valid)
    .limit(1);
  if (!session) return null;
  if (session.needsRefresh) {
    // Recheck in SQL so concurrent requests perform at most one renewal per hour.
    await db
      .update(sessions)
      .set({ lastUsedAt: sql`now()`, expiresAt })
      .where(and(valid, needsRefresh));
    // A concurrent logout must not resurrect the session.
    const [stillValid] = await db.select({ id: sessions.id }).from(sessions).where(valid).limit(1);
    if (!stillValid) return null;
  }
  return { sessionId: session.sessionId, userId: session.userId };
}

export async function revokeSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
export async function revokeAllSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
export async function revokeOtherSessions(db: Db, userId: string, sessionId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId)));
}
export async function cleanupExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
}
