import type { ShoppingItem } from '@lean/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { shoppingItems } from '../db/schema';

const week = '2026-W46';
describe.skipIf(!hasTestDatabase)('shopping integration', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30000);
  afterEach(async () => {
    await f.cleanup();
  }, 30000);
  const generate = async (user = 0) => {
    const response = await f.request('/shopping/generate', 'POST', { week }, user);
    expect(response.status).toBe(200);
    return (await response.json()) as ShoppingItem[];
  };
  it('sums only planned grams, preserves checked/manual items and removes obsolete foods', async () => {
    const food = await f.food(0, { name: 'Arroz', brand: 'Marca' });
    const removed = await f.food(0, { name: 'Banana' });
    const entry = await f.entry(food.id!, { status: 'planned', grams: 100 });
    await f.entry(food.id!, { status: 'planned', grams: 150 });
    await f.entry(food.id!, { grams: 999 });
    const obsolete = await f.entry(removed.id!, { status: 'planned' });
    await f.entry(food.id!, { status: 'planned', date: '2026-11-16' });
    const initial = await generate();
    expect(initial).toHaveLength(2);
    const rice = initial.find((i) => i.foodId === food.id)!;
    expect(rice).toMatchObject({
      label: 'Arroz · Marca',
      totalGrams: 250,
      checked: false,
      manual: false,
    });
    expect((await f.request(`/shopping/${rice.id}`, 'PATCH', { checked: true })).status).toBe(200);
    const manualResponse = await f.request('/shopping', 'POST', {
      week,
      label: ' Sal ',
      quantity: 12.5,
    });
    expect(manualResponse.status).toBe(201);
    const manual = (await manualResponse.json()) as ShoppingItem;
    expect(manual).toMatchObject({ label: 'Sal', foodId: null, totalGrams: 12.5, manual: true });
    expect((await f.request(`/entries/${entry.id}`, 'PATCH', { grams: 200 })).status).toBe(200);
    expect((await f.request(`/entries/${obsolete.id}`, 'DELETE')).status).toBe(204);
    const result = await generate();
    expect(result).toEqual([{ ...rice, totalGrams: 350, checked: true }, manual]);
    expect(await (await f.request(`/shopping?week=${week}`)).json()).toEqual(result);
    for (const patch of [{ label: 'Nuevo' }, { quantity: 1 }, { quantity: null }]) {
      const response = await f.request(`/shopping/${rice.id}`, 'PATCH', patch);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: 'validation_error',
          message: 'Solo se pueden editar los ítems agregados a mano',
        },
      });
    }
    expect(
      await (
        await f.request(`/shopping/${manual.id}`, 'PATCH', { label: ' Pimienta ', quantity: null })
      ).json(),
    ).toMatchObject({ label: 'Pimienta', totalGrams: null });
    expect((await f.request(`/shopping/checked?week=${week}`, 'DELETE')).status).toBe(204);
    expect(
      ((await (await f.request(`/shopping?week=${week}`)).json()) as ShoppingItem[]).map(
        (i) => i.id,
      ),
    ).toEqual([manual.id]);
    expect((await f.request(`/shopping/${manual.id}`, 'DELETE')).status).toBe(204);
    expect((await f.request(`/shopping/${manual.id}`, 'DELETE')).status).toBe(404);
  });
  it('deduplicates generated rows, keeps any checked value, and preserves manuals on empty plans', async () => {
    const food = await f.food();
    const entry = await f.entry(food.id!, { status: 'planned', grams: 100 });
    await f.db.insert(shoppingItems).values(
      [false, true, false].map((purchased) => ({
        userId: f.accounts[0]!.user.id,
        weekStart: '2026-11-09',
        foodId: food.id!,
        grams: '1',
        purchased,
      })),
    );
    const manual = (await (
      await f.request('/shopping', 'POST', { week, label: 'Sal' })
    ).json()) as ShoppingItem;
    const items = await generate();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ foodId: food.id, totalGrams: 100, checked: true });
    await f.request(`/entries/${entry.id}`, 'DELETE');
    expect(await generate()).toEqual([manual]);
  });
  it('orders generated labels ignoring case and manual items by creation', async () => {
    for (const name of ['banana', 'Zanahoria', 'Arroz']) {
      const food = await f.food(0, { name });
      await f.entry(food.id!, { status: 'planned' });
    }
    await f.request('/shopping', 'POST', { week, label: 'Z manual' });
    await f.request('/shopping', 'POST', { week, label: 'A manual' });
    expect((await generate()).map((i) => i.label)).toEqual([
      'Arroz',
      'banana',
      'Zanahoria',
      'Z manual',
      'A manual',
    ]);
  });
  it('isolates all shopping operations between users', async () => {
    const food = await f.food();
    await f.entry(food.id!, { status: 'planned' });
    const [item] = await generate();
    await f.request(`/shopping/${item!.id}`, 'PATCH', { checked: true });
    expect(await (await f.request(`/shopping?week=${week}`, 'GET', undefined, 1)).json()).toEqual(
      [],
    );
    expect(await generate(1)).toEqual([]);
    for (const method of ['PATCH', 'DELETE']) {
      const response = await f.request(
        `/shopping/${item!.id}`,
        method,
        method === 'PATCH' ? { checked: false } : undefined,
        1,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
    }
    expect((await f.request(`/shopping/checked?week=${week}`, 'DELETE', undefined, 1)).status).toBe(
      204,
    );
    expect((await f.request('/shopping', 'POST', { week, label: 'Ajeno' }, 1)).status).toBe(201);
    expect(await (await f.request(`/shopping?week=${week}`)).json()).toEqual([
      { ...item, checked: true },
    ]);
  });
});
