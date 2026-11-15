import type { Food, FoodSearchResponse, LoginResponse } from '@lean/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  getTestDb,
  hasTestDatabase,
  testDatabaseUrl,
} from '../../test/helpers/db';
import type { Db } from '../db/client';
import { foods, mealEntries } from '../db/schema';
import { app } from '../index';
import { testEnv } from '../test-env';

const custom = { name: 'Personalizado exclusivo', kcal: 100, protein: 10, carbs: 10, fat: 2 };
const rawProduct = (code: string) => ({
  code,
  product_name_es: 'Producto externo de prueba',
  nutriments: { 'energy-kcal_100g': 120, proteins_100g: 10, carbohydrates_100g: 10, fat_100g: 3 },
});
describe.skipIf(!hasTestDatabase)('foods integration', () => {
  let db: Db;
  let accounts: Awaited<ReturnType<typeof createTestUser>>[];
  let tokens: string[];
  let codes: string[];
  let offFetch: ReturnType<typeof vi.fn<typeof fetch>>;
  const request = (path: string, token = tokens[0], method = 'GET', body?: unknown) =>
    app.request(
      `/api/foods${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { ...testEnv, DATABASE_URL: testDatabaseUrl()! },
    );
  const code = () => {
    const value = `29${crypto.getRandomValues(new Uint32Array(1))[0]!.toString().padStart(10, '0')}`;
    codes.push(value);
    return value;
  };
  const create = async (token = tokens[0], patch: Record<string, unknown> = {}) => {
    const response = await request('', token, 'POST', { ...custom, ...patch });
    expect(response.status).toBe(201);
    return (await response.json()) as Food;
  };
  const search = async (q: string, token = tokens[0], limit = 20) => {
    const response = await request(`/search?q=${encodeURIComponent(q)}&limit=${limit}`, token);
    expect(response.status).toBe(200);
    return (await response.json()) as FoodSearchResponse;
  };
  beforeEach(async () => {
    db = getTestDb();
    accounts = [];
    tokens = [];
    codes = [];
    for (let i = 0; i < 2; i++) {
      const account = await createTestUser(db);
      accounts.push(account);
      const response = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': `test-foods-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({ username: account.user.username, password: account.password }),
        },
        { ...testEnv, DATABASE_URL: testDatabaseUrl()! },
      );
      expect(response.status).toBe(200);
      tokens.push(((await response.json()) as LoginResponse).token);
    }
    const originalFetch = globalThis.fetch;
    offFetch = vi.fn().mockImplementation(async () => Response.json({ status: 0, products: [] }));
    // Preserve Neon HTTP requests while simulating every OFF request.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url).hostname === 'world.openfoodfacts.org'
        ? offFetch(input, init)
        : originalFetch(input, init);
    });
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks();
    // Remove diary references before custom foods are cascade-deleted.
    for (const account of accounts)
      await db.delete(mealEntries).where(eq(mealEntries.userId, account.user.id));
    for (const account of accounts) await deleteTestUser(db, account.user.id);
    if (codes.length)
      await db.delete(foods).where(and(eq(foods.source, 'off'), inArray(foods.barcode, codes)));
  }, 30_000);
  it('creates a custom food with POST /api/foods without a trailing slash', async () => {
    const response = await request('', tokens[0], 'POST', custom);
    expect(response.status).toBe(201);
    const food = (await response.json()) as Food;
    expect(food).toMatchObject({ ...custom, id: expect.any(String), source: 'custom' });
    expect(await db.select().from(foods).where(eq(foods.id, food.id!))).toMatchObject([
      { id: food.id, name: custom.name, source: 'custom', ownerId: accounts[0]!.user.id },
    ]);
  });
  it('finds typos and accents and avoids OFF for plentiful seed results', async () => {
    expect((await search('polo')).items.some((f) => /pollo/i.test(f.name))).toBe(true);
    expect((await search('limon')).items.some((f) => f.name === 'Limón sin cáscara crudo')).toBe(
      true,
    );
    offFetch.mockClear();
    expect((await search('pollo')).items.length).toBeGreaterThanOrEqual(5);
    expect(offFetch).not.toHaveBeenCalled();
    expect((await search('pollo', tokens[0], 1)).items).toHaveLength(1);
    expect(offFetch).not.toHaveBeenCalled();
  });
  it('persists barcodes once, supports import and simultaneous lookups', async () => {
    const barcode = code();
    offFetch.mockImplementation(async () =>
      Response.json({ status: 1, product: rawProduct(barcode) }),
    );
    const responses = await Promise.all([
      request(`/barcode/${barcode}`),
      request('/import', tokens[0], 'POST', { barcode }),
    ]);
    const saved = await Promise.all(
      responses.map(async (r) => {
        expect(r.status).toBe(200);
        return (await r.json()) as Food;
      }),
    );
    expect(saved[0]?.id).toBeTruthy();
    expect(saved[0]?.id).toBe(saved[1]?.id);
    offFetch.mockClear();
    expect((await request(`/barcode/${barcode}`)).status).toBe(200);
    expect((await request('/import', tokens[0], 'POST', { barcode })).status).toBe(200);
    expect(offFetch).not.toHaveBeenCalled();
    expect(await db.select().from(foods).where(eq(foods.barcode, barcode))).toHaveLength(1);
  });
  it('appends unsaved OFF results, deduplicates stored codes and respects the total limit', async () => {
    const storedCode = code(),
      externalCode = code(),
      extraCode = code();
    await db.insert(foods).values({
      source: 'off',
      barcode: storedCode,
      name: 'Producto guardado',
      kcalPer100g: 100,
      proteinPer100g: '1',
      carbsPer100g: '1',
      fatPer100g: '1',
    });
    const local = await create(tokens[0], { name: 'zzqxfood local' });
    offFetch.mockImplementation(async () =>
      Response.json({
        products: [
          rawProduct(storedCode),
          rawProduct(externalCode),
          rawProduct(externalCode),
          rawProduct(extraCode),
        ],
      }),
    );
    const result = await search('zzqxfood', tokens[0], 3);
    expect(result.offAvailable).toBe(true);
    expect(result.items.map((f) => f.id)).toEqual([local.id, null, null]);
    expect(result.items.map((f) => f.barcode)).toEqual([null, externalCode, extraCode]);
    expect(result.items.slice(1).every((f) => f.source === 'off')).toBe(true);
    expect(
      await db
        .select()
        .from(foods)
        .where(inArray(foods.barcode, [externalCode, extraCode])),
    ).toEqual([]);
    expect((await search('zzqxfood', tokens[0], 2)).items).toHaveLength(2);
  });
  it('degrades search on outages and returns 503 for barcode outages', async () => {
    offFetch.mockRejectedValue(new Error('offline'));
    expect(await search('zzqxrare')).toEqual({ items: [], offAvailable: false });
    const response = await request(`/barcode/${code()}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'off_unavailable' } });
  });
  it('discards incomplete products from searches and barcode lookups', async () => {
    const barcode = code();
    const invalid = { ...rawProduct(barcode), nutriments: { 'energy-kcal_100g': 100 } };
    offFetch.mockImplementation(async () =>
      Response.json({ status: 1, product: invalid, products: [invalid] }),
    );
    expect((await search('zzqxrare')).items).toEqual([]);
    expect((await request(`/barcode/${barcode}`)).status).toBe(404);
    expect(await db.select().from(foods).where(eq(foods.barcode, barcode))).toHaveLength(0);
  });
  it('isolates custom foods and allows one identical barcode per owner and OFF', async () => {
    const barcode = code(),
      name = `zzqx${crypto.randomUUID()}`;
    const a = await create(tokens[0], { barcode, name });
    expect((await search(name, tokens[1])).items).toEqual([]);
    expect((await request(`/barcode/${barcode}`, tokens[1])).status).toBe(404);
    expect((await request(`/${a.id}`, tokens[1], 'PATCH', { name: 'Ajeno' })).status).toBe(404);
    expect((await request(`/${a.id}`, tokens[1], 'DELETE')).status).toBe(404);
    const b = await create(tokens[1], { barcode });
    expect(((await (await request(`/barcode/${barcode}`, tokens[1])).json()) as Food).id).toBe(
      b.id,
    );
    expect((await request('', tokens[0], 'POST', { ...custom, barcode })).status).toBe(409);
    // Shared products can coexist with either user's custom barcode.
    await db.insert(foods).values({
      source: 'off',
      barcode,
      name: 'Compartido',
      kcalPer100g: 100,
      proteinPer100g: '1',
      carbsPer100g: '1',
      fatPer100g: '1',
    });
    expect(((await (await request(`/barcode/${barcode}`)).json()) as Food).id).toBe(a.id);
  });
  it('never edits or deletes shared seed or OFF foods', async () => {
    const [seed] = await db.select().from(foods).where(eq(foods.source, 'seed')).limit(1);
    expect(seed).toBeDefined();
    const barcode = code();
    offFetch.mockImplementation(async () =>
      Response.json({ status: 1, product: rawProduct(barcode) }),
    );
    const off = (await (await request(`/barcode/${barcode}`)).json()) as Food;
    for (const id of [seed!.id, off.id]) {
      expect((await request(`/${id}`, tokens[0], 'PATCH', { name: 'Cambio' })).status).toBe(404);
      expect((await request(`/${id}`, tokens[0], 'DELETE')).status).toBe(404);
    }
  });
  it('validates merged updates, clears fields, and reports duplicate codes', async () => {
    const a = await create(tokens[0], { barcode: code(), servingG: 30, servingLabel: 'porción' });
    const b = await create(tokens[0], { barcode: code() });
    expect((await request(`/${a.id}`, tokens[0], 'PATCH', { protein: 99 })).status).toBe(400);
    expect((await request(`/${a.id}`, tokens[0], 'PATCH', { servingG: null })).status).toBe(400);
    expect((await request(`/${a.id}`, tokens[0], 'PATCH', { barcode: b.barcode })).status).toBe(
      409,
    );
    const response = await request(`/${a.id}`, tokens[0], 'PATCH', {
      servingG: null,
      servingLabel: null,
      barcode: null,
      brand: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      servingG: null,
      servingLabel: null,
      barcode: null,
      brand: null,
    });
    expect((await request(`/${a.id}`, tokens[0], 'DELETE')).status).toBe(204);
  });
  it('returns only the user history with correct recent and frequent ordering, and prevents deletion in use', async () => {
    const a = await create(),
      b = await create(tokens[0], { name: 'Segundo' }),
      old = await create(tokens[0], { name: 'Antiguo' });
    const foreign = await create(tokens[1]);
    const entry = (userId: string, foodId: string, days: number, hours: number) => ({
      userId,
      foodId,
      date: sql`current_date - ${days}::integer`,
      meal: 'lunch' as const,
      grams: '100',
      kcal: 100,
      protein: '10',
      carbs: '10',
      fat: '2',
      createdAt: sql`now() - ${hours} * interval '1 hour'`,
    });
    await db
      .insert(mealEntries)
      .values([
        entry(accounts[0]!.user.id, a.id!, 0, 1),
        entry(accounts[0]!.user.id, b.id!, 1, 2),
        entry(accounts[0]!.user.id, b.id!, 2, 3),
        entry(accounts[0]!.user.id, old.id!, 61, 4),
        entry(accounts[1]!.user.id, foreign.id!, 0, 0),
      ]);
    const recent = (await (await request('/recent')).json()) as Food[];
    expect(recent.map((f) => f.id)).toEqual([a.id, b.id, old.id]);
    const frequent = (await (await request('/frequent')).json()) as Food[];
    expect(frequent.map((f) => f.id)).toEqual([b.id, a.id]);
    expect(await (await request('/recent?limit=1')).json()).toHaveLength(1);
    expect(await (await request('/frequent?limit=1')).json()).toHaveLength(1);
    expect(
      ((await (await request('/recent', tokens[1])).json()) as Food[]).map((f) => f.id),
    ).toEqual([foreign.id]);
    const response = await request(`/${a.id}`, tokens[0], 'DELETE');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'food_in_use' } });
    // Previously used results rank before otherwise stronger local matches.
    expect((await search('Segundo')).items[0]?.id).toBe(b.id);
  });
  it('validates query, barcode, id and payload before accessing foods', async () => {
    for (const path of ['/search?q=', '/search?q=x&limit=51', '/recent?limit=0', '/barcode/abc'])
      expect((await request(path)).status).toBe(400);
    expect((await request('/abc', tokens[0], 'PATCH', { name: 'X' })).status).toBe(400);
    expect((await request('', tokens[0], 'POST', { ...custom, protein: 99 })).status).toBe(400);
  });
});
