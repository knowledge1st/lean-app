import type { Entry, ParseMealTextResponse } from '@lean/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase, testDatabaseUrl } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { foods, mealEntries, textLogUsage } from '../db/schema';
import type { AppEnv } from '../env';
import { handleError } from '../lib/errors';
import { buildCatalog } from '../lib/textLog/catalog';
import { getFreeModels, refreshFreeRemaining, savedModels } from '../lib/textLog/freeModels';
import { remainingToday, reserveAiUse } from '../lib/textLog/quota';
import { testEnv } from '../test-env';
import { createTextLogEntryRoutes } from './entriesTextLog';

// Real database, quota and interpreter, with only discovery/account requests stubbed.
// No integration test can contact OpenRouter, even with a configured database.
vi.mock('../lib/textLog/freeModels', () => ({
  getFreeModels: vi.fn(),
  refreshFreeRemaining: vi.fn(),
  savedModels: vi.fn(),
}));
vi.mock('../lib/textLog/health', () => ({ recordFailure: vi.fn(), recordSuccess: vi.fn() }));
const state = {
  candidates: ['testing/model:free'],
  photoCandidates: ['testing/model:free'],
  checkedAt: new Date(),
  freeRemaining: 50,
  freeCheckedAt: null,
};

describe.skipIf(!hasTestDatabase)('text log database and A/B isolation', { timeout: 30000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  const offIds: string[] = [];
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getFreeModels).mockResolvedValue(state);
    vi.mocked(savedModels).mockResolvedValue(state);
    vi.mocked(refreshFreeRemaining).mockResolvedValue(49);
    f = diaryFixture();
    await f.setup();
  });
  afterEach(async () => {
    await f.cleanup();
    if (offIds.length) await f.db.delete(foods).where(inArray(foods.id, offIds.splice(0)));
  });
  const ownedEntries = (user: number) =>
    f.db.select().from(mealEntries).where(eq(mealEntries.userId, f.accounts[user]!.user.id));
  const parse = (
    text: string,
    network: typeof fetch,
    user = 0,
    key = true,
    kind: 'text' | 'photo' = 'text',
  ) => {
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('userId', f.accounts[user]!.user.id);
      await next();
    });
    app.onError(handleError);
    app.route('/entries', createTextLogEntryRoutes(network));
    return app.request(
      `/entries/parse-${kind}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(kind === 'photo' ? { image: text } : { text }),
          date: '2026-11-17',
          defaultMeal: 'lunch',
        }),
      },
      {
        ...testEnv,
        DATABASE_URL: testDatabaseUrl()!,
        ...(key ? { OPENROUTER_API_KEY: 'fake' } : {}),
      },
    );
  };

  it('isolates photo quota by user and preserves the independent text allowance', async () => {
    const a = f.accounts[0]!.user.id;
    const b = f.accounts[1]!.user.id;
    await f.db
      .insert(textLogUsage)
      .values(Array.from({ length: 10 }, () => ({ userId: a, kind: 'photo', outcome: 'ok' })));
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        model: 'testing/model:free',
        choices: [
          { message: { content: JSON.stringify({ items: [], otherDayMentioned: false }) } },
        ],
      }),
    );
    const photo = 'data:image/jpeg;base64,YQ==';
    const exhausted = await parse(photo, network, 0, true, 'photo');
    expect(exhausted.status).toBe(429);
    expect(await exhausted.json()).toMatchObject({ error: { code: 'photo_log_quota' } });
    expect(network).not.toHaveBeenCalled();
    expect((await parse(photo, network, 1, true, 'photo')).status).toBe(422);
    expect(network).toHaveBeenCalledOnce();
    expect(await remainingToday(f.db, a, undefined, null, 'photo')).toBe(0);
    expect(await remainingToday(f.db, b, undefined, null, 'photo')).toBe(9);
    expect(await remainingToday(f.db, a, undefined, null)).toBe(20);
    expect(await ownedEntries(0)).toEqual([]);
    expect(await ownedEntries(1)).toEqual([]);
  });
  it('never creates entries or stores text during AI interpretation', async () => {
    const text = 'arroz confidencial de prueba';
    await f.food(0, { name: 'Arroz de prueba', servingG: 100, servingLabel: '1 porción' });
    const before = await ownedEntries(0);
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        model: 'testing/model:free',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                items: [
                  {
                    meal: null,
                    said: 'arroz',
                    searchQuery: 'Arroz de prueba',
                    catalogIndex: null,
                    grams: 100,
                    gramsStated: false,
                    units: 2,
                    approximate: false,
                  },
                ],
                otherDayMentioned: false,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    );
    const response = await parse(text, network);
    expect(response.status).toBe(200);
    const result = (await response.json()) as ParseMealTextResponse;
    expect(result).toMatchObject({
      interpreter: 'ai',
      remainingToday: 19,
      items: [{ grams: 200, mealSource: 'default' }],
    });
    expect(await ownedEntries(0)).toEqual(before);
    const usage = await f.db
      .select()
      .from(textLogUsage)
      .where(eq(textLogUsage.userId, f.accounts[0]!.user.id));
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ outcome: 'ok', promptTokens: 100, attempts: 1 });
    expect(JSON.stringify(usage)).not.toContain(text);
    expect(usage[0]).not.toHaveProperty('text');
    expect(result).not.toHaveProperty('model');
  });
  it('falls back without a key or items, preserves entries and uses no quota', async () => {
    const network = vi.fn<typeof fetch>();
    const response = await parse('ayer 200 g de arroz', network, 0, false);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      interpreter: 'rules',
      warnings: [
        'Interpretación simple: revisá con más cuidado.',
        'Se van a cargar en el día que estás viendo',
      ],
    });
    expect((await parse('ayer', network, 0, false)).status).toBe(422);
    expect(network).not.toHaveBeenCalled();
    expect(await ownedEntries(0)).toEqual([]);
    expect(await remainingToday(f.db, f.accounts[0]!.user.id, undefined, null)).toBe(20);
  });
  it('isolates quota and remainingToday while exhausted A falls back without further usage', async () => {
    const a = f.accounts[0]!.user.id;
    const b = f.accounts[1]!.user.id;
    await f.db
      .insert(textLogUsage)
      .values(Array.from({ length: 20 }, () => ({ userId: a, outcome: 'ok' as const })));
    const network = vi.fn<typeof fetch>();
    expect(await (await parse('arroz', network)).json()).toMatchObject({
      interpreter: 'rules',
      remainingToday: 0,
    });
    expect(network).not.toHaveBeenCalled();
    expect(await f.db.select().from(textLogUsage).where(eq(textLogUsage.userId, a))).toHaveLength(
      20,
    );
    expect(await remainingToday(f.db, a, undefined, 50)).toBe(0);
    expect(await remainingToday(f.db, b, undefined, 50)).toBe(20);
    expect(await remainingToday(f.db, b, undefined, 3)).toBe(3);
    expect(await reserveAiUse(f.db, b)).toMatchObject({ reserved: true, usedToday: 1 });
    expect(await remainingToday(f.db, b, undefined, null)).toBe(19);
  });
  it('serializes competing reservations at the daily boundary', async () => {
    const userId = f.accounts[0]!.user.id;
    await f.db
      .insert(textLogUsage)
      .values(Array.from({ length: 19 }, () => ({ userId, outcome: 'ok' as const })));
    const reservations = await Promise.all([
      reserveAiUse(f.db, userId),
      reserveAiUse(f.db, userId),
    ]);
    expect(reservations.filter((reservation) => reservation.reserved)).toHaveLength(1);
    expect(await remainingToday(f.db, userId, undefined, null)).toBe(0);
    expect(
      await f.db.select().from(textLogUsage).where(eq(textLogUsage.userId, userId)),
    ).toHaveLength(20);
  });
  it('includes only recent OFF history of the catalogue owner and keeps shared custom foods', async () => {
    const [recent, old, future] = await f.db
      .insert(foods)
      .values(
        ['reciente', 'viejo', 'futuro'].map((name) => ({
          source: 'off' as const,
          name: `OFF ${name} ${crypto.randomUUID()}`,
          kcalPer100g: 100,
          proteinPer100g: '1',
          carbsPer100g: '1',
          fatPer100g: '1',
        })),
      )
      .returning();
    offIds.push(recent!.id, old!.id, future!.id);
    await f.entry(recent!.id, { date: new Date().toISOString().slice(0, 10) });
    await f.entry(old!.id, { date: '2020-01-01' });
    await f.entry(future!.id, { date: '2099-01-01', status: 'planned' });
    const custom = await f.food(0);
    const a = await buildCatalog(f.db, f.accounts[0]!.user.id);
    const b = await buildCatalog(f.db, f.accounts[1]!.user.id);
    expect(a.map((item) => item.foodId)).toContain(recent!.id);
    for (const id of offIds) expect(b.map((item) => item.foodId)).not.toContain(id);
    expect(a.map((item) => item.foodId)).not.toContain(old!.id);
    expect(a.map((item) => item.foodId)).not.toContain(future!.id);
    expect(b.map((item) => item.foodId)).toContain(custom.id);
    expect(a.map((item) => item.index)).toEqual(a.map((_, index) => index));
    expect(a.at(-1)?.foodId).toBe(recent!.id);
  });
  it('creates B batch in received order, freezes macros and leaves A unchanged', async () => {
    const food = await f.food();
    const response = await f.request(
      '/entries/batch',
      'POST',
      {
        date: '2026-12-01',
        status: 'planned',
        items: [
          { foodId: food.id, grams: 33.3, meal: 'dinner' },
          { foodId: food.id, grams: 200, meal: 'breakfast' },
        ],
      },
      1,
    );
    expect(response.status).toBe(201);
    const entries = (await response.json()) as Entry[];
    expect(entries.map((entry) => entry.grams)).toEqual([33.3, 200]);
    expect(entries.map((entry) => entry.meal)).toEqual(['dinner', 'breakfast']);
    expect(entries[0]).toMatchObject({
      date: '2026-12-01',
      status: 'planned',
      kcal: 67,
      protein: 3.4,
    });
    const [stored] = await f.db
      .select()
      .from(mealEntries)
      .where(
        and(eq(mealEntries.id, entries[0]!.id), eq(mealEntries.userId, f.accounts[1]!.user.id)),
      );
    expect(stored?.protein).toBe('3.4133');
    expect(await ownedEntries(0)).toEqual([]);
    expect(await ownedEntries(1)).toHaveLength(2);
    expect(await (await f.request('/entries?from=2026-12-01&to=2026-12-01')).json()).toEqual([]);
  });
  it('rejects a missing middle food atomically and persists eaten status and date', async () => {
    const food = await f.food();
    const before = await ownedEntries(0);
    const body = {
      date: '2026-11-14',
      status: 'eaten',
      items: [food.id, crypto.randomUUID(), food.id].map((foodId) => ({
        foodId,
        grams: 100,
        meal: 'lunch',
      })),
    };
    expect((await f.request('/entries/batch', 'POST', body)).status).toBe(404);
    expect(await ownedEntries(0)).toEqual(before);
    body.items.splice(1, 1);
    const response = await f.request('/entries/batch', 'POST', body);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject([
      { date: '2026-11-14', status: 'eaten' },
      { date: '2026-11-14', status: 'eaten' },
    ]);
  });
});
