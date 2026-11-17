import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  getTestDb,
  hasTestDatabase,
} from '../../../test/helpers/db';
import type { Db } from '../../db/client';
import { foods, type Food } from '../../db/schema';
import { mapItems } from './mapping';
import { parseWithRules } from './rules';

describe.skipIf(!hasTestDatabase)('text log mapping candidate admission', () => {
  let db: Db;
  let userId: string;
  let inserted: Food[];

  beforeEach(async () => {
    db = getTestDb();
    userId = (await createTestUser(db)).user.id;
    inserted = await db
      .insert(foods)
      .values(
        [
          'Café negro preparado sin azúcar',
          'Castañas de cajú crudas',
          'Caqui crudo',
          'Carne picada vacuna común cruda',
          'Arroz blanco largo cocido',
        ].map((name) => ({
          name,
          source: 'custom' as const,
          ownerId: userId,
          kcalPer100g: 100,
          proteinPer100g: '0',
          carbsPer100g: '0',
          fatPer100g: '0',
        })),
      )
      .returning();
  });
  afterEach(async () => {
    await db.delete(foods).where(eq(foods.ownerId, userId));
    await deleteTestUser(db, userId);
  });

  it('admits coffee and excludes cashews, persimmon and ground beef, including catalogue choices', async () => {
    const caqui = inserted.find((food) => food.name === 'Caqui crudo')!;
    const parse = parseWithRules('cafe');
    parse.items[0]!.catalogIndex = 0;
    const [result] = await mapItems(
      db,
      userId,
      parse,
      [{ index: 0, foodId: caqui.id, name: caqui.name }],
      'breakfast',
      'rules',
    );
    expect(result?.food?.name).toMatch(/café/i);
    expect(result?.match).not.toBe('none');
    const names = [result?.food?.name, ...result!.alternatives.map((food) => food.name)];
    expect(names).not.toContain('Castañas de cajú crudas');
    expect(names).not.toContain('Caqui crudo');
    expect(names).not.toContain('Carne picada vacuna común cruda');
  });

  it('continues mapping rice', async () => {
    const [result] = await mapItems(db, userId, parseWithRules('arroz'), [], 'lunch', 'rules');
    expect(result?.food?.name).toMatch(/arroz/i);
    expect(result?.match).not.toBe('none');
  });

  it('returns none without alternatives when no candidate passes, including a catalogue choice', async () => {
    const parse = parseWithRules('zxqvzxqvzxqv');
    parse.items[0]!.catalogIndex = 0;
    const [result] = await mapItems(
      db,
      userId,
      parse,
      [{ index: 0, foodId: inserted[0]!.id, name: inserted[0]!.name }],
      'lunch',
      'rules',
    );
    expect(result).toMatchObject({ match: 'none', food: null, alternatives: [] });
  });
});
