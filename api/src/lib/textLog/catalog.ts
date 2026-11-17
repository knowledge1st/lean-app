import { asc, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { foods, mealEntries } from '../../db/schema';

export interface CatalogItem {
  index: number;
  foodId: string;
  name: string;
}

export async function buildCatalog(db: Db, userId: string): Promise<CatalogItem[]> {
  const rows = await db
    .select({ foodId: foods.id, name: foods.name })
    .from(foods)
    .where(
      sql`${foods.source} IN ('seed', 'custom') OR (
      ${foods.source} = 'off' AND EXISTS (
        SELECT 1 FROM ${mealEntries}
        WHERE ${mealEntries.foodId} = ${foods.id} AND ${mealEntries.userId} = ${userId}
          AND ${mealEntries.date} BETWEEN current_date - 90 AND current_date
      )
    )`,
    )
    .orderBy(
      sql`CASE WHEN ${foods.source} = 'off' THEN 1 ELSE 0 END`,
      asc(foods.name),
      asc(foods.id),
    );
  return rows.map((row, index) => ({ index, ...row }));
}
