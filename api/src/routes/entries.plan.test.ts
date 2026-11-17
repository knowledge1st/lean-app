import type { Entry } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { mealEntries } from '../db/schema';

describe.skipIf(!hasTestDatabase)('entry planning integration', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30000);
  afterEach(async () => {
    await f.cleanup();
  }, 30000);
  const copy = async (body: unknown, user = 0) => {
    const response = await f.request('/entries/copy', 'POST', body, user);
    expect(response.status).toBe(201);
    return (await response.json()) as Entry[];
  };
  it.each(['eaten', 'planned'])(
    'appends only the owned meal with %s status and frozen macros',
    async (status) => {
      const food = await f.food();
      const source = await f.entry(food.id!, { meal: 'dinner', grams: 33.3 });
      const plannedSource = await f.entry(food.id!, {
        meal: 'dinner',
        status: 'planned',
        grams: 44.4,
      });
      await f.entry(food.id!, { meal: 'lunch' });
      const existing = await f.entry(food.id!, { date: '2026-11-15', meal: 'dinner' });
      const otherMeal = await f.entry(food.id!, {
        date: '2026-11-15',
        meal: 'lunch',
        status: 'planned',
      });
      const body = { scope: 'meal', from: '2026-11-14', to: '2026-11-15', meal: 'dinner', status };
      expect(await copy(body, 1)).toEqual([]);
      const otherFood = await f.food(1);
      await f.entry(otherFood.id!, { meal: 'dinner' }, 1);
      const otherUserDestination = await f.entry(
        otherFood.id!,
        { date: '2026-11-15', meal: 'dinner' },
        1,
      );
      const result = await copy(body);
      expect(result).toHaveLength(2);
      for (const entry of result) {
        const original = entry.grams === source.grams ? source : plannedSource;
        expect(entry.id).not.toBe(original.id);
        expect(entry).toMatchObject({
          date: body.to,
          meal: 'dinner',
          status,
          foodId: food.id,
          grams: original.grams,
          kcal: original.kcal,
          protein: original.protein,
          carbs: original.carbs,
          fat: original.fat,
        });
      }
      const remaining = (await (
        await f.request('/entries?from=2026-11-15&to=2026-11-15')
      ).json()) as Entry[];
      expect(remaining).toHaveLength(4);
      expect(remaining).toContainEqual(existing);
      expect(remaining).toContainEqual(otherMeal);
      expect(await copy({ ...body, from: '2026-11-13' })).toEqual([]);
      expect(
        await (
          await f.request('/entries?from=2026-11-15&to=2026-11-15', 'GET', undefined, 1)
        ).json(),
      ).toEqual([otherUserDestination]);
    },
  );
  it.each(['meal', 'day', 'week'] as const)(
    'preserves source order when copying a %s',
    async (scope) => {
      const food = await f.food();
      for (const [index, grams] of [300, 100, 200].entries()) {
        const entry = await f.entry(food.id!, { meal: 'dinner', grams });
        await f.db
          .update(mealEntries)
          .set({ createdAt: new Date(1700000000000 + index) })
          .where(eq(mealEntries.id, entry.id));
      }
      const result = await copy(
        scope === 'week'
          ? { scope, from: '2026-W46', to: '2026-W47', mode: 'append' }
          : scope === 'day'
            ? { scope, from: '2026-11-14', to: '2026-11-21', mode: 'append' }
            : { scope, from: '2026-11-14', to: '2026-11-21', meal: 'dinner', status: 'eaten' },
      );
      expect(result.map((entry) => entry.grams)).toEqual([300, 100, 200]);
      expect(result.map((entry) => Date.parse(entry.createdAt))).toEqual([
        Date.parse(result[0]!.createdAt),
        Date.parse(result[0]!.createdAt) + 1,
        Date.parse(result[0]!.createdAt) + 2,
      ]);
      const persisted = (await (
        await f.request('/entries?from=2026-11-21&to=2026-11-21')
      ).json()) as Entry[];
      expect(persisted.map((entry) => entry.grams)).toEqual([300, 100, 200]);
    },
  );
  it('copies four frozen snapshots even after editing the food', async () => {
    const food = await f.food();
    const source: Entry[] = [];
    for (const meal of ['breakfast', 'lunch', 'afternoon_snack', 'dinner'])
      source.push(
        await f.entry(food.id!, {
          meal,
          grams: 33.3,
          status: meal === 'dinner' ? 'planned' : 'eaten',
        }),
      );
    expect(
      (
        await f.request(`/foods/${food.id}`, 'PATCH', {
          kcal: 600,
          protein: 30,
          carbs: 40,
          fat: 20,
        })
      ).status,
    ).toBe(200);
    const copies = await copy({
      scope: 'day',
      from: '2026-11-14',
      to: '2026-11-15',
      mode: 'append',
    });
    expect(copies).toHaveLength(4);
    for (const [i, entry] of copies.entries()) {
      expect(entry).toMatchObject({
        date: '2026-11-15',
        status: 'planned',
        foodId: food.id,
        grams: 33.3,
        meal: source[i]!.meal,
      });
      const [original] = await f.db
        .select()
        .from(mealEntries)
        .where(eq(mealEntries.id, source[i]!.id));
      const [created] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, entry.id));
      for (const macro of ['kcal', 'protein', 'carbs', 'fat'] as const) {
        expect(created![macro]).toBe(original![macro]);
        expect(entry[macro]).toBe(source[i]![macro]);
      }
    }
  });
  it('replaces only planned entries and clears the destination for an empty source', async () => {
    const food = await f.food();
    await f.entry(food.id!);
    const eaten = await f.entry(food.id!, { date: '2026-11-15' });
    const planned = [];
    for (let i = 0; i < 2; i++)
      planned.push(await f.entry(food.id!, { date: '2026-11-15', status: 'planned' }));
    const copies = await copy({
      scope: 'day',
      from: '2026-11-14',
      to: '2026-11-15',
      mode: 'replace',
    });
    expect(copies).toHaveLength(1);
    let remaining = (await (
      await f.request('/entries?from=2026-11-15&to=2026-11-15')
    ).json()) as Entry[];
    expect(remaining.map((e) => e.id).sort()).toEqual([eaten.id, copies[0]!.id].sort());
    for (const entry of planned) expect(remaining.some((e) => e.id === entry.id)).toBe(false);
    expect(
      await copy({ scope: 'day', from: '2026-11-13', to: '2026-11-15', mode: 'append' }),
    ).toEqual([]);
    expect(
      await copy({ scope: 'day', from: '2026-11-13', to: '2026-11-15', mode: 'replace' }),
    ).toEqual([]);
    remaining = (await (
      await f.request('/entries?from=2026-11-15&to=2026-11-15')
    ).json()) as Entry[];
    expect(remaining.map((e) => e.id)).toEqual([eaten.id]);
  });
  it.each(['day', 'week'])('serializes concurrent day and %s replacements', async (scope) => {
    const food = await f.food();
    await f.entry(food.id!, { grams: 100 });
    await f.entry(food.id!, { grams: 200 });
    const eaten = await f.entry(food.id!, { date: '2026-11-21' });
    await f.entry(food.id!, { date: '2026-11-21', status: 'planned', grams: 300 });
    const body = {
      scope: 'day',
      from: '2026-11-14',
      to: '2026-11-21',
      mode: 'replace',
    };
    const responses = await Promise.all([
      f.request('/entries/copy', 'POST', body),
      f.request(
        '/entries/copy',
        'POST',
        scope === 'week' ? { scope, from: '2026-W46', to: '2026-W47', mode: 'replace' } : body,
      ),
    ]);
    const copies = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(201);
        const entries = (await response.json()) as Entry[];
        expect(entries).toHaveLength(2);
        expect(entries.map((entry) => entry.grams).sort()).toEqual([100, 200]);
        for (const entry of entries)
          expect(entry).toMatchObject({ date: '2026-11-21', status: 'planned', foodId: food.id });
        return entries;
      }),
    );
    expect(new Set(copies.flat().map((entry) => entry.id)).size).toBe(4);
    const remaining = (await (
      await f.request('/entries?from=2026-11-21&to=2026-11-21')
    ).json()) as Entry[];
    expect(remaining.filter((entry) => entry.status === 'eaten')).toEqual([eaten]);
    expect(
      remaining
        .filter((entry) => entry.status === 'planned')
        .map((entry) => entry.grams)
        .sort(),
    ).toEqual([100, 200]);
  });
  it('copies Monday and Sunday across ISO years and replaces the whole week', async () => {
    const food = await f.food();
    await f.entry(food.id!, { date: '2026-12-28' });
    await f.entry(food.id!, { date: '2027-01-03' });
    await f.entry(food.id!, { date: '2027-01-06', status: 'planned' });
    const eaten = await f.entry(food.id!, { date: '2027-01-08' });
    const result = await copy({ scope: 'week', from: '2026-W53', to: '2027-W01', mode: 'replace' });
    expect(result.map((e) => e.date)).toEqual(['2027-01-04', '2027-01-10']);
    const remaining = (await (
      await f.request('/entries?from=2027-01-04&to=2027-01-10')
    ).json()) as Entry[];
    expect(remaining.map((e) => e.id).sort()).toEqual(
      [...result.map((e) => e.id), eaten.id].sort(),
    );
  });
  it('marks only planned entries in the requested day and meal and isolates users', async () => {
    const food = await f.food();
    const lunch = await f.entry(food.id!, { status: 'planned' });
    const dinner = await f.entry(food.id!, { status: 'planned', meal: 'dinner' });
    const otherDay = await f.entry(food.id!, { status: 'planned', date: '2026-11-15' });
    const eaten = await f.entry(food.id!);
    const [before] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, eaten.id));
    expect(
      await copy({ scope: 'day', from: '2026-11-14', to: '2026-11-16', mode: 'append' }, 1),
    ).toEqual([]);
    expect(
      await (await f.request('/entries/mark-eaten', 'POST', { date: '2026-11-14' }, 1)).json(),
    ).toEqual([]);
    const changed = await f.request('/entries/mark-eaten', 'POST', {
      date: '2026-11-14',
      meal: 'lunch',
    });
    expect(changed.status).toBe(200);
    expect(((await changed.json()) as Entry[]).map((e) => e.id)).toEqual([lunch.id]);
    const allMeals = await f.request('/entries/mark-eaten', 'POST', { date: '2026-11-14' });
    expect(((await allMeals.json()) as Entry[]).map((e) => e.id)).toEqual([dinner.id]);
    const [after] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, eaten.id));
    expect(after).toEqual(before);
    const [other] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, otherDay.id));
    expect(other!.status).toBe('planned');
    const [marked] = await f.db.select().from(mealEntries).where(eq(mealEntries.id, lunch.id));
    expect(marked!.updatedAt.getTime()).toBeGreaterThan(marked!.createdAt.getTime());
  });
});
