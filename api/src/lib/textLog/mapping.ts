import type { AiMealParse, ProposedItem } from '@lean/shared';
import { getTableColumns, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { foods, type Food } from '../../db/schema';
import { serializeFood } from '../../routes/foods';
import type { CatalogItem } from './catalog';

// Same strict-word score used to rank /foods/search. Below 0.8 needs review as a substitute.
export const EXACT_MATCH_THRESHOLD = 0.8;
interface SearchRow {
  itemIndex: number;
  chosen: Food | null;
  chosenScore: number | null;
  food: Food | null;
  score: number | null;
}

export async function mapItems(
  db: Db,
  userId: string,
  parse: AiMealParse,
  catalog: readonly CatalogItem[],
  defaultMeal: ProposedItem['meal'],
  interpreter: 'ai' | 'rules' = 'ai',
): Promise<ProposedItem[]> {
  if (!parse.items.length) return [];
  const byIndex = new Map(catalog.map((item) => [item.index, item.foodId]));
  const ids = parse.items.map((item) =>
    item.catalogIndex === null ? null : (byIndex.get(item.catalogIndex) ?? null),
  );
  const queries = parse.items.map((item) => item.searchQuery.trim());
  // JSON keys match the Drizzle row consumed by the shared food serializer.
  const foodJson = sql`json_build_object(${sql.join(
    Object.entries(getTableColumns(foods)).flatMap(([key, column]) => [
      sql`${key}::text`,
      sql`${column}`,
    ]),
    sql`, `,
  )})`;
  const queryArray = sql`ARRAY[${sql.join(
    queries.map((query) => sql`${query}`),
    sql`, `,
  )}]::text[]`;
  const idArray = sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
  const result = await db.execute(sql`
    SELECT q.ordinality - 1 AS "itemIndex", chosen.food AS chosen, matches.food AS food,
      matches.score AS score, chosen.score AS "chosenScore"
    FROM unnest(${queryArray}, ${idArray}) WITH ORDINALITY AS q(query, chosen_id, ordinality)
    LEFT JOIN LATERAL (
      SELECT ${foodJson} AS food,
        similarity(translate(lower(q.query), 'áéíóúüñ', 'aeiouun'),
          translate(lower(${foods.name}), 'áéíóúüñ', 'aeiouun')) AS score
      FROM ${foods} WHERE ${foods.id} = q.chosen_id
    ) chosen ON true
    LEFT JOIN LATERAL (
      SELECT ${foodJson} AS food,
        EXISTS (SELECT 1 FROM meal_entries e WHERE e.food_id = ${foods.id} AND e.user_id = ${userId}) AS used,
        similarity(n.query, n.name) AS similarity, ${foods.name} AS name, ${foods.id} AS id,
        greatest(strict_word_similarity(n.query, n.name), strict_word_similarity(n.query, n.brand)) AS score
      FROM ${foods}
      CROSS JOIN LATERAL (SELECT
        translate(lower(q.query), 'áéíóúüñ', 'aeiouun') AS query,
        translate(lower(${foods.name}), 'áéíóúüñ', 'aeiouun') AS name,
        translate(lower(coalesce(${foods.brand}, '')), 'áéíóúüñ', 'aeiouun') AS brand
      ) n
      WHERE n.query <> '' AND (
        greatest(word_similarity(n.query, n.name), word_similarity(n.query, n.brand)) >= 0.3
        OR strpos(n.name, n.query) > 0
      )
      ORDER BY EXISTS (SELECT 1 FROM meal_entries e WHERE e.food_id = ${foods.id} AND e.user_id = ${userId}) DESC,
        score DESC, similarity(n.query, n.name) DESC, ${foods.name} ASC, ${foods.id} ASC
      LIMIT 4
    ) matches ON true
    ORDER BY q.ordinality, matches.used DESC, matches.score DESC, matches.similarity DESC, matches.name ASC, matches.id ASC
  `);
  const rows = result.rows as unknown as SearchRow[];
  return parse.items.map((item, index) => {
    const matches = rows.filter((row) => Number(row.itemIndex) === index);
    const indexed = matches[0]?.chosen ?? null;
    const first = matches.find((row) => row.food !== null);
    const chosen = indexed ?? first?.food ?? null;
    const alternatives = matches
      .flatMap((row) =>
        row.food && row.food.id !== chosen?.id ? [serializeFood(row.food, userId)] : [],
      )
      .slice(0, 3);
    const grams = item.gramsStated
      ? item.grams
      : item.units !== null && chosen?.servingGrams != null
        ? item.units * Number(chosen.servingGrams)
        : interpreter === 'rules' && item.units === null
          ? Number(chosen?.servingGrams ?? 100)
          : item.grams;
    return {
      key: crypto.randomUUID(),
      meal: item.meal ?? defaultMeal,
      mealSource: item.meal === null ? 'default' : 'text',
      said: item.said,
      grams: Math.max(1, Math.min(2000, Math.round(grams))),
      gramsEstimated: !item.gramsStated,
      match: !chosen
        ? 'none'
        : item.approximate ||
          (indexed
            ? Number(matches[0]?.chosenScore ?? 0) < 0.3
            : Number(first?.score ?? 0) < EXACT_MATCH_THRESHOLD)
          ? 'approximate'
          : 'exact',
      food: chosen ? serializeFood(chosen, userId) : null,
      alternatives,
      searchQuery: item.searchQuery,
    };
  });
}
