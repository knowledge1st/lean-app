import { and, eq, gt, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { loginAttempts } from '../db/schema';

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MINUTES = 15;

export async function registerLoginAttempt(db: Db, username: string, ip: string) {
  const recent = gt(
    loginAttempts.createdAt,
    sql`now() - ${LOGIN_WINDOW_MINUTES} * interval '1 minute'`,
  );
  // Neon batches are non-interactive transactions. Separate lock statements give
  // the following counts a fresh READ COMMITTED snapshot after any wait.
  // Always lock username before IP, with separate namespaces to avoid deadlocks.
  const [, , attempts, counts] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(1, hashtext(${username}))`),
    db.execute(sql`SELECT pg_advisory_xact_lock(2, hashtext(${ip}))`),
    db.insert(loginAttempts).values({ username, ip }).returning({ id: loginAttempts.id }),
    db
      .select({
        byUsername:
          sql<number>`count(*) FILTER (WHERE ${loginAttempts.username} = ${username})`.mapWith(
            Number,
          ),
        byIp: sql<number>`count(*) FILTER (WHERE ${loginAttempts.ip} = ${ip})`.mapWith(Number),
      })
      .from(loginAttempts)
      .where(and(recent, or(eq(loginAttempts.username, username), eq(loginAttempts.ip, ip)))),
  ]);
  const attempt = attempts[0];
  const totals = counts[0];
  if (!attempt || !totals) throw new Error('No se pudo registrar el intento de login');
  return {
    id: attempt.id,
    blocked: totals.byUsername > LOGIN_MAX_ATTEMPTS || totals.byIp > LOGIN_MAX_ATTEMPTS,
  };
}
export async function removeLoginAttempt(db: Db, id: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.id, id));
}
export async function cleanupOldAttempts(db: Db) {
  // Keep a full day to avoid pruning near the active 15-minute window.
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, sql`now() - interval '1 day'`));
}
