import { gt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { textLogModelHealth } from '../../db/schema';

export async function recordFailure(db: Db, model: string, now: Date): Promise<void> {
  const t = textLogModelHealth;
  const cutoff = new Date(now.getTime() - 86_400_000);
  const failures = sql`CASE WHEN ${t.lastFailureAt} >= ${cutoff} THEN ${t.failures} + 1 ELSE 1 END`;
  await db
    .insert(t)
    .values({ model, failures: 1, lastFailureAt: now })
    .onConflictDoUpdate({
      target: t.model,
      set: {
        failures,
        lastFailureAt: now,
        degradedUntil: sql`CASE WHEN (${failures}) >= 3 THEN ${new Date(now.getTime() + 86_400_000)}::timestamptz ELSE ${t.degradedUntil} END`,
      },
    });
}

export async function recordSuccess(db: Db, model: string): Promise<void> {
  await db
    .insert(textLogModelHealth)
    .values({ model, failures: 0 })
    .onConflictDoUpdate({
      target: textLogModelHealth.model,
      set: { failures: 0, lastFailureAt: null, degradedUntil: null },
    });
}

export async function degradedModels(
  db: Db,
  now: Date,
  kind: 'text' | 'photo' = 'text',
): Promise<string[]> {
  const rows = await db
    .select({ model: textLogModelHealth.model })
    .from(textLogModelHealth)
    .where(gt(textLogModelHealth.degradedUntil, now));
  return rows
    .map((row) => row.model)
    .filter((model) => model.startsWith('photo:') === (kind === 'photo'))
    .map((model) => (kind === 'photo' ? model.slice(6) : model));
}
