import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb, type Db } from '../db/client';
import type { NewMealEntry } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { handleError } from '../lib/errors';
import { testEnv } from '../test-env';
import { entries } from './entries';
import { shopping } from './shopping';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const validationApp = new Hono<AppEnv>();
validationApp.use('*', async (c, next) => {
  c.set('userId', '00000000-0000-4000-8000-000000000001');
  await next();
});
validationApp.route('/api/entries', entries);
validationApp.route('/api/shopping', shopping);
validationApp.onError(handleError);
const request = (path: string, method: string, body?: unknown) =>
  validationApp.request(
    `/api${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    testEnv,
  );

describe('planning and shopping without database', () => {
  it.each([
    [
      '/entries/copy',
      'POST',
      { scope: 'day', from: '2026-11-14', to: '2026-11-14', mode: 'append' },
    ],
    ['/entries/copy', 'POST', { scope: 'week', from: '2021-W53', to: '2026-W53', mode: 'append' }],
    ['/entries/mark-eaten', 'POST', { date: '2026-02-30' }],
    ['/entries/mark-eaten', 'POST', { date: '2026-11-14', meal: 'other' }],
    ['/shopping?week=2021-W53', 'GET', undefined],
    ['/shopping/generate', 'POST', { week: '2021-W53' }],
    ['/shopping', 'POST', { week: '2026-W53', label: ' ', quantity: 1 }],
    ['/shopping', 'POST', { week: '2026-W53', label: 'Sal', quantity: 0 }],
    ['/shopping/checked?week=2021-W53', 'DELETE', undefined],
    ['/shopping/abc', 'PATCH', { checked: true }],
    ['/shopping/abc', 'DELETE', undefined],
    [`/shopping/${crypto.randomUUID()}`, 'PATCH', {}],
  ])('validates %s %s before accessing the database', async (path, method, body) => {
    const response = await request(path, method, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each([
    ['/entries/copy', 'POST'],
    ['/entries/mark-eaten', 'POST'],
    ['/shopping?week=2026-W53', 'GET'],
    ['/shopping/generate', 'POST'],
    ['/shopping', 'POST'],
    ['/shopping/abc', 'PATCH'],
    ['/shopping/checked?week=2026-W53', 'DELETE'],
    ['/shopping/abc', 'DELETE'],
  ])('requires a session for %s %s', async (path, method) => {
    expect((await app.request(`/api${path}`, { method }, testEnv)).status).toBe(401);
  });
  it.each(['append', 'replace'])('handles an empty copy source in %s mode', async (mode) => {
    const deletion = {};
    const lock = {};
    const execute = vi.fn().mockReturnValue(lock);
    const batch = vi.fn().mockResolvedValue([]);
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
      }),
      delete: () => ({ where: () => deletion }),
      execute,
      batch,
    } as unknown as Db);
    const response = await request('/entries/copy', 'POST', {
      scope: 'day',
      from: '2026-11-14',
      to: '2026-11-15',
      mode,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual([]);
    if (mode === 'replace') {
      expect(batch).toHaveBeenCalledExactlyOnceWith([lock, deletion]);
      const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0] as SQL);
      expect(query.sql).toContain('pg_advisory_xact_lock(5, hashtext(');
      expect(query.params).toEqual(['00000000-0000-4000-8000-000000000001']);
    } else {
      expect(batch).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    }
  });
  it('copies frozen macros across ISO years and batches replacement with insertion', async () => {
    const foodId = crypto.randomUUID();
    const source = ['2026-12-28', '2027-01-03'].map((date) => ({
      entry: {
        id: crypto.randomUUID(),
        userId: '00000000-0000-4000-8000-000000000001',
        date,
        meal: 'lunch',
        foodId,
        grams: '33.3',
        status: 'eaten',
        kcal: '66.6000',
        protein: '3.4133',
        carbs: '6.8265',
        fat: '1.0490',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      food: {
        id: foodId,
        source: 'custom',
        name: 'Edited food',
        brand: null,
        servingGrams: null,
        servingLabel: null,
        kcalPer100g: 999,
      },
    }));
    let inserted: NewMealEntry[] = [];
    const insertion = {},
      deletion = {},
      lock = {};
    const execute = vi.fn().mockReturnValue(lock);
    const orderBy = vi.fn().mockResolvedValueOnce(source);
    const batch = vi
      .fn()
      .mockImplementation(async () => [
        undefined,
        undefined,
        inserted.map((entry) => ({ ...entry, createdAt: new Date() })).reverse(),
      ]);
    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy }) }) }) }),
      delete: () => ({ where: () => deletion }),
      insert: () => ({
        values: (values: NewMealEntry[]) => {
          inserted = values;
          return { returning: () => insertion };
        },
      }),
      execute,
      batch,
    } as unknown as Db);
    const response = await request('/entries/copy', 'POST', {
      scope: 'week',
      from: '2026-W53',
      to: '2027-W01',
      mode: 'replace',
    });
    expect(response.status).toBe(201);
    expect(batch).toHaveBeenCalledExactlyOnceWith([lock, deletion, insertion]);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain('pg_advisory_xact_lock(5, hashtext(');
    expect(query.params).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(inserted.map((row) => row.date)).toEqual(['2027-01-04', '2027-01-10']);
    for (const row of inserted)
      expect(row).toMatchObject({
        foodId,
        grams: '33.3',
        status: 'planned',
        kcal: '66.6000',
        protein: '3.4133',
        carbs: '6.8265',
        fat: '1.0490',
      });
    expect(await response.json()).toMatchObject([
      { date: '2027-01-04', kcal: 67, protein: 3.4, status: 'planned' },
      { date: '2027-01-10', kcal: 67, protein: 3.4, status: 'planned' },
    ]);
  });
  it('regenerates from shared materialized inputs in one statement after the lock', async () => {
    const execute = vi.fn((statement: SQL) => statement);
    const batch = vi.fn().mockResolvedValue([]);
    vi.mocked(getDb).mockReturnValue({
      execute,
      batch,
      select: () => ({
        from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
      }),
    } as unknown as Db);
    const response = await request('/shopping/generate', 'POST', { week: '2026-W46' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(batch).toHaveBeenCalledExactlyOnceWith(
      execute.mock.calls.map(([statement]) => statement),
    );
    const [lock, regeneration] = execute.mock.calls.map(([statement]) =>
      new PgDialect().sqlToQuery(statement),
    );
    expect(lock!.sql).toContain('pg_advisory_xact_lock(4, hashtext(');
    expect(lock!.params).toEqual(['00000000-0000-4000-8000-000000000001:2026-11-09']);
    const query = regeneration!.sql.replace(/\s+/g, ' ').trim();
    expect(query).toMatch(/^WITH plan AS MATERIALIZED \(/);
    expect(query).toContain('existing AS MATERIALIZED (');
    expect(query).toContain('updated AS ( UPDATE shopping_items');
    expect(query).toContain('deleted AS ( DELETE FROM shopping_items');
    expect(query).toContain('array_agg(id) FILTER (WHERE purchased) AS purchased_ids');
    expect(query).toContain(
      'purchased = item.purchased OR EXISTS ( SELECT 1 FROM unnest(existing.purchased_ids) AS duplicate(id) WHERE duplicate.id <> item.id )',
    );
    expect(query).toMatch(
      /INSERT INTO shopping_items .* FROM plan WHERE NOT EXISTS \(SELECT 1 FROM existing WHERE existing.food_id = plan.food_id\)$/,
    );
    expect(regeneration!.params).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '2026-11-09',
      '2026-11-15',
      '00000000-0000-4000-8000-000000000001',
      '2026-11-09',
      '00000000-0000-4000-8000-000000000001',
      '2026-11-09',
      '00000000-0000-4000-8000-000000000001',
      '2026-11-09',
      '00000000-0000-4000-8000-000000000001',
      '2026-11-09',
    ]);
  });
  it.each([{ label: 'Sal' }, { quantity: 1 }, { quantity: null }])(
    'rejects generated item edits %j',
    async (body) => {
      const update = vi.fn();
      vi.mocked(getDb).mockReturnValue({
        select: () => ({ from: () => ({ where: async () => [{ foodId: crypto.randomUUID() }] }) }),
        update,
      } as unknown as Db);
      const response = await request(`/shopping/${crypto.randomUUID()}`, 'PATCH', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: 'validation_error',
          message: 'Solo se pueden editar los ítems agregados a mano',
        },
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
  it('returns 404 for an item outside the owned selection', async () => {
    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ where: async () => [] }) }),
    } as unknown as Db);
    expect(
      (await request(`/shopping/${crypto.randomUUID()}`, 'PATCH', { checked: true })).status,
    ).toBe(404);
  });
});
