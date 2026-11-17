import type { AiMealParse } from '@lean/shared';
import { eq, getTableName } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, type Db } from '../db/client';
import { mealEntries, textLogUsage, type Food } from '../db/schema';
import type { AppEnv } from '../env';
import { handleError } from '../lib/errors';
import { getFreeModels, savedModels, refreshFreeRemaining } from '../lib/textLog/freeModels';
import { reserveAiUse, finishAiUse, remainingToday } from '../lib/textLog/quota';
import { testEnv } from '../test-env';
import { entries } from './entries';
import { createTextLogEntryRoutes } from './entriesTextLog';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));
vi.mock('../lib/textLog/freeModels', () => ({
  getFreeModels: vi.fn(),
  savedModels: vi.fn(),
  refreshFreeRemaining: vi.fn(),
}));
vi.mock('../lib/textLog/health', () => ({ recordFailure: vi.fn(), recordSuccess: vi.fn() }));
vi.mock('../lib/textLog/quota', () => ({
  reserveAiUse: vi.fn(),
  finishAiUse: vi.fn(),
  remainingToday: vi.fn(),
}));
const food: Food = {
  id: crypto.randomUUID(),
  name: 'Arroz',
  source: 'seed',
  ownerId: null,
  brand: null,
  barcode: null,
  kcalPer100g: 130,
  proteinPer100g: '2.69',
  carbsPer100g: '28.17',
  fatPer100g: '0.28',
  servingGrams: null,
  servingLabel: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const state = {
  candidates: ['qwen/a:free', 'qwen/b:free'],
  freeRemaining: 10,
  freeCheckedAt: null,
  checkedAt: new Date(),
};
const parse: AiMealParse = {
  items: [
    {
      meal: 'dinner',
      said: 'arroz',
      searchQuery: 'arroz',
      catalogIndex: 0,
      grams: 200,
      gramsStated: true,
      units: null,
      approximate: false,
    },
  ],
  otherDayMentioned: false,
};
const network = vi.fn<typeof fetch>();
const insert = vi.fn();
const deleteUsage = vi.fn();
const deleteWhere = vi.fn();
let db: Db;
let app: Hono<AppEnv>;
const request = (
  path: string,
  body: unknown,
  withKey = true,
  executionCtx?: Parameters<typeof app.request>[3],
) =>
  app.request(
    `/entries/${path}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    withKey ? { ...testEnv, OPENROUTER_API_KEY: 'fake' } : testEnv,
    executionCtx,
  );
const input = { text: 'arroz', date: '2026-11-17', defaultMeal: 'lunch' };
const reply = (content = parse, model = 'qwen/a:free') =>
  Response.json({
    model,
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 15, completion_tokens: 10 },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFreeModels).mockResolvedValue(state);
  vi.mocked(savedModels).mockResolvedValue(state);
  vi.mocked(refreshFreeRemaining).mockResolvedValue(9);
  vi.mocked(reserveAiUse).mockResolvedValue({ reserved: true, usageId: 'usage', usedToday: 1 });
  vi.mocked(remainingToday).mockResolvedValue(9);
  network.mockImplementation(async () => reply());
  deleteUsage.mockReturnValue({ where: deleteWhere });
  deleteWhere.mockResolvedValue(undefined);
  insert.mockImplementation((table) => ({
    values: (values: Record<string, unknown>[]) => ({
      returning: async () =>
        [...values]
          .reverse()
          .map((value) => ({ ...value, createdAt: new Date(), updatedAt: new Date(), table })),
    }),
  }));
  db = {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const rows =
          getTableName(table) === 'profiles'
            ? [{ timeZone: 'America/Argentina/Buenos_Aires' }]
            : [food];
        const promise = Promise.resolve(rows);
        return {
          where: () =>
            Object.assign(promise, {
              orderBy: async () => [{ index: 0, foodId: food.id, name: food.name }],
            }),
        };
      },
    }),
    execute: vi.fn().mockResolvedValue({
      rows: [{ itemIndex: 0, chosen: food, chosenScore: 1, food, score: 1 }],
    }),
    insert,
    delete: deleteUsage,
  } as unknown as Db;
  vi.mocked(getDb).mockReturnValue(db);
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('userId', 'session-user');
    await next();
  });
  app.onError(handleError);
  app.route('/entries', createTextLogEntryRoutes(network));
});

afterEach(() => vi.useRealTimers());

describe('parse-text with injected fetch', () => {
  it('exposes parse-text and batch through the application entries router', async () => {
    const mounted = new Hono<AppEnv>();
    mounted.use('*', async (c, next) => {
      c.set('userId', 'session-user');
      await next();
    });
    mounted.onError(handleError);
    mounted.route('/api/entries', entries);
    const headers = { 'Content-Type': 'application/json' };
    expect(
      (
        await mounted.request(
          '/api/entries/parse-text',
          { method: 'POST', headers, body: JSON.stringify(input) },
          testEnv,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await mounted.request(
          '/api/entries/batch',
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              date: input.date,
              status: 'eaten',
              items: [{ foodId: food.id, meal: 'lunch', grams: 100 }],
            }),
          },
          testEnv,
        )
      ).status,
    ).toBe(201);
  });
  it('uses AI, sends only the user text, returns no model and creates no entries', async () => {
    const response = await request('parse-text', input);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      interpreter: 'ai',
      remainingToday: 9,
      warnings: [],
      items: [{ meal: 'dinner', grams: 200 }],
    });
    const body = JSON.parse(String(network.mock.calls[0]?.[1]?.body));
    expect(body.messages[1]).toEqual({ role: 'user', content: input.text });
    expect(body).not.toHaveProperty('user');
    expect(finishAiUse).toHaveBeenCalledWith(
      db,
      'usage',
      expect.objectContaining({ ok: true, promptTokens: 15 }),
    );
    expect(JSON.stringify(vi.mocked(finishAiUse).mock.calls)).not.toContain('"text"');
    expect(insert).not.toHaveBeenCalled();
  });
  it('falls back without a key and warns for another day', async () => {
    const response = await request('parse-text', { ...input, text: 'ayer arroz' }, false);
    expect(await response.json()).toMatchObject({
      interpreter: 'rules',
      warnings: [
        'Interpretación simple: revisá con más cuidado.',
        'Se van a cargar en el día que estás viendo',
      ],
    });
    expect(network).not.toHaveBeenCalled();
    expect(reserveAiUse).not.toHaveBeenCalled();
  });
  it.each([
    { ...state, candidates: [] },
    { ...state, freeRemaining: 0 },
  ])('uses rules without reserving when discovery is unavailable %j', async (unavailable) => {
    vi.mocked(getFreeModels).mockResolvedValue(unavailable);
    expect(await (await request('parse-text', input)).json()).toMatchObject({
      interpreter: 'rules',
      warnings: ['Interpretación simple: revisá con más cuidado.'],
    });
    expect(network).not.toHaveBeenCalled();
    expect(reserveAiUse).not.toHaveBeenCalled();
  });
  it('uses rules at the personal quota without model calls or further usage', async () => {
    vi.mocked(reserveAiUse).mockResolvedValue({ reserved: false, usedToday: 20 });
    vi.mocked(remainingToday).mockResolvedValue(0);
    expect(await (await request('parse-text', input)).json()).toMatchObject({
      interpreter: 'rules',
      remainingToday: 0,
    });
    expect(network).not.toHaveBeenCalled();
    expect(finishAiUse).not.toHaveBeenCalled();
  });
  it('includes initial discovery in the 30 second deadline without reserving quota', async () => {
    vi.useFakeTimers();
    vi.mocked(getFreeModels).mockImplementationOnce(() => new Promise(() => {}));
    const response = request('parse-text', input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await (await response).json()).toMatchObject({ interpreter: 'rules' });
    expect(network).not.toHaveBeenCalled();
    expect(reserveAiUse).not.toHaveBeenCalled();
  });
  it('shares the deadline between discovery and model calls', async () => {
    vi.useFakeTimers();
    vi.mocked(getFreeModels).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(state), 10_000);
        }),
    );
    network.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(reply()), 25_000);
        }),
    );
    const response = request('parse-text', input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await (await response).json()).toMatchObject({ interpreter: 'rules' });
    expect(finishAiUse).toHaveBeenCalledWith(
      db,
      'usage',
      expect.objectContaining({
        attempts: 1,
        outcome: 'timeout',
      }),
    );
    expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(deleteUsage).not.toHaveBeenCalled();
  });
  it('releases quota when food catalogue preparation reaches the deadline', async () => {
    vi.useFakeTimers();
    const select = db.select.bind(db);
    vi.spyOn(db, 'select').mockImplementation(((...args: Parameters<typeof db.select>) => {
      const query = select(...args);
      return {
        from: (table: Parameters<typeof getTableName>[0]) =>
          getTableName(table) === 'foods'
            ? { where: () => ({ orderBy: () => new Promise(() => {}) }) }
            : query.from(table),
      };
    }) as typeof db.select);
    const response = request('parse-text', input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await (await response).json()).toMatchObject({ interpreter: 'rules' });
    expect(network).not.toHaveBeenCalled();
    expect(deleteUsage).toHaveBeenCalledExactlyOnceWith(textLogUsage);
    expect(deleteWhere).toHaveBeenCalledExactlyOnceWith(eq(textLogUsage.id, 'usage'));
    expect(finishAiUse).not.toHaveBeenCalled();
  });
  it('keeps late reservation cleanup alive through waitUntil after responding', async () => {
    vi.useFakeTimers();
    let reserve!: (value: Awaited<ReturnType<typeof reserveAiUse>>) => void;
    vi.mocked(reserveAiUse).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reserve = resolve;
        }),
    );
    let release!: () => void;
    deleteWhere.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const tasks: Promise<unknown>[] = [];
    const waitUntil = vi.fn((task: Promise<unknown>) => {
      tasks.push(task);
    });
    const response = request('parse-text', input, true, {
      waitUntil,
      passThroughOnException() {},
      props: {},
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await (await response).json()).toMatchObject({ interpreter: 'rules' });
    expect(waitUntil).toHaveBeenCalled();
    let drained = false;
    const drain = Promise.all(tasks).then(() => {
      drained = true;
    });
    reserve({ reserved: true, usageId: 'usage', usedToday: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(deleteUsage).toHaveBeenCalledExactlyOnceWith(textLogUsage);
    expect(deleteWhere).toHaveBeenCalledExactlyOnceWith(eq(textLogUsage.id, 'usage'));
    expect(finishAiUse).not.toHaveBeenCalled();
    release();
    await drain;
    expect(drained).toBe(true);
  });
  it.each(['release', 'finish'])(
    'registers slow quota %s without delaying the response',
    async (kind) => {
      vi.useFakeTimers();
      if (kind === 'release') {
        vi.mocked(getFreeModels).mockImplementationOnce(async () => state);
        const select = db.select.bind(db);
        vi.spyOn(db, 'select').mockImplementation(((...args: Parameters<typeof db.select>) => {
          const query = select(...args);
          return {
            from: (table: Parameters<typeof getTableName>[0]) =>
              getTableName(table) === 'foods'
                ? { where: () => ({ orderBy: () => new Promise(() => {}) }) }
                : query.from(table),
          };
        }) as typeof db.select);
        deleteWhere.mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(resolve, 80_000)),
        );
      } else {
        vi.mocked(finishAiUse).mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(resolve, 80_000)),
        );
      }
      const tasks: Promise<unknown>[] = [];
      const response = request('parse-text', input, true, {
        waitUntil(task) {
          tasks.push(task);
        },
        passThroughOnException() {},
        props: {},
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await response).status).toBe(200);
      expect(tasks.length).toBeGreaterThan(0);
      // The catalogue preparation may never finish; drain the registered quota task.
      let drained = false;
      const drain = tasks.at(-1)!.then(() => {
        drained = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(drained).toBe(false);
      await vi.advanceTimersByTimeAsync(80_000);
      await drain;
    },
  );
  it.each(['429', '500', 'invalid', 'paid', 'empty', 'timeout'])(
    'falls back after AI failure %s',
    async (mode) => {
      network.mockImplementation(async () => {
        if (mode === '429' || mode === '500') return new Response('', { status: Number(mode) });
        if (mode === 'timeout') throw new DOMException('timeout', 'AbortError');
        if (mode === 'empty') return reply({ items: [], otherDayMentioned: false });
        if (mode === 'paid') return reply(parse, 'paid/model');
        return Response.json({ model: 'qwen/a:free', choices: [{ message: { content: '{}' } }] });
      });
      const response = await request('parse-text', input);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        interpreter: 'rules',
        warnings: ['Interpretación simple: revisá con más cuidado.'],
      });
      expect(finishAiUse).toHaveBeenCalledTimes(1);
      expect(deleteUsage).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    },
  );
  it('returns 422 when neither interpreter finds items and validates input', async () => {
    network.mockResolvedValue(reply({ items: [], otherDayMentioned: false }));
    const response = await request('parse-text', { ...input, text: 'ayer' });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'text_not_understood' } });
    expect((await request('parse-text', { ...input, text: '' })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('batch route', () => {
  it('inserts once with frozen macros, requested date/status and input order', async () => {
    const response = await request('batch', {
      date: '2026-12-01',
      status: 'planned',
      items: [
        { meal: 'dinner', foodId: food.id, grams: 33.3 },
        { meal: 'breakfast', foodId: food.id, grams: 200 },
      ],
    });
    expect(response.status).toBe(201);
    const result = (await response.json()) as { meal: string; grams: number }[];
    expect(result.map((entry) => entry.grams)).toEqual([33.3, 200]);
    expect(result.map((entry) => entry.meal)).toEqual(['dinner', 'breakfast']);
    expect(result[0]).toMatchObject({
      date: '2026-12-01',
      status: 'planned',
      kcal: 43,
      protein: 0.9,
    });
    expect(insert).toHaveBeenCalledExactlyOnceWith(mealEntries);
  });
  it('rejects a missing middle food before inserting anything', async () => {
    const response = await request('batch', {
      date: '2026-11-17',
      status: 'eaten',
      items: [food.id, crypto.randomUUID(), food.id].map((foodId) => ({
        foodId,
        meal: 'lunch',
        grams: 100,
      })),
    });
    expect(response.status).toBe(404);
    expect(insert).not.toHaveBeenCalled();
  });
  it('validates batch input before database use', async () => {
    expect((await request('batch', { date: 'bad', status: 'eaten', items: [] })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
});
