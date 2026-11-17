import { DEFAULT_REMINDERS, remindersResponseSchema } from '@lean/shared';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase, testDatabaseUrl } from '../../test/helpers/db';
import { diaryFixture } from '../../test/helpers/diary';
import { completeProfile } from '../../test/helpers/goals';
import { fakeSubscription, generateVapidKeys } from '../../test/helpers/push';
import { pushSubscriptions, reminderDeliveries } from '../db/schema';
import { runReminders, SCHEDULE_KEY, type Schedule } from '../lib/reminders';
import { testEnv } from '../test-env';

/** Minimal in-memory KV with the two methods the schedule cache uses. */
function memoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: async (key: string, type?: string) => {
        const value = store.get(key);
        return value === undefined ? null : type === 'json' ? JSON.parse(value) : value;
      },
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    } as unknown as KVNamespace,
  };
}

describe.skipIf(!hasTestDatabase)('reminders and push integration', { timeout: 60_000 }, () => {
  let f: ReturnType<typeof diaryFixture>;
  let vapid: Awaited<ReturnType<typeof generateVapidKeys>>;
  beforeAll(async () => {
    vapid = await generateVapidKeys();
  });
  beforeEach(async () => {
    f = diaryFixture();
    await f.setup();
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks();
    await f.cleanup();
  }, 30_000);
  const env = () => ({ ...vapid, APP_URL: 'https://example.test/lean-app/' });

  it('starts with the defaults and stores only what the user changes', async () => {
    const initial = remindersResponseSchema.parse(await (await f.request('/reminders')).json());
    expect(initial.reminders).toHaveLength(6);
    expect(initial.reminders.find((r) => r.slot === 'day_close')).toMatchObject({
      ...DEFAULT_REMINDERS.day_close,
      message: null,
    });
    const response = await f.request('/reminders', 'PUT', {
      reminders: [
        { slot: 'lunch', enabled: false, time: '14:00', message: 'Almorzá tranqui' },
        { slot: 'snack', enabled: true, time: '11:15', message: '' },
      ],
    });
    expect(response.status).toBe(200);
    const saved = remindersResponseSchema.parse(await response.json()).reminders;
    expect(saved.find((r) => r.slot === 'lunch')).toMatchObject({
      enabled: false,
      time: '14:00',
      message: 'Almorzá tranqui',
    });
    expect(saved.find((r) => r.slot === 'snack')).toMatchObject({
      enabled: true,
      time: '11:15',
      message: null,
    });
    // The other user still sees the defaults.
    const other = remindersResponseSchema.parse(
      await (await f.request('/reminders', 'GET', undefined, 1)).json(),
    );
    expect(other.reminders.find((r) => r.slot === 'lunch')?.enabled).toBe(true);
    const invalid = await f.request('/reminders', 'PUT', {
      reminders: [{ slot: 'lunch', enabled: true, time: '25:00', message: null }],
    });
    expect(invalid.status).toBe(400);
  });

  it('answers 503 without VAPID keys and manages subscriptions per user', async () => {
    const subscription = await fakeSubscription();
    expect((await f.request('/push/public-key')).status).toBe(503);
    expect((await f.request('/push/subscriptions', 'POST', subscription)).status).toBe(503);
    const key = await f.request('/push/public-key', 'GET', undefined, 0, env());
    expect(await key.json()).toEqual({ publicKey: vapid.VAPID_PUBLIC_KEY });
    expect((await f.request('/push/subscriptions', 'POST', subscription, 0, env())).status).toBe(
      201,
    );
    // The same browser signing in as the other user moves the subscription.
    expect((await f.request('/push/subscriptions', 'POST', subscription, 1, env())).status).toBe(
      201,
    );
    const rows = await f.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(f.accounts[1]!.user.id);
    // User 0 cannot delete user 1's subscription.
    await f.request('/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint }, 0, env());
    expect(
      await f.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint)),
    ).toHaveLength(1);
    const removed = await f.request(
      '/push/subscriptions',
      'DELETE',
      { endpoint: subscription.endpoint },
      1,
      env(),
    );
    expect(removed.status).toBe(204);
    expect(
      await f.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint)),
    ).toHaveLength(0);
  });

  it('sends a test notification and reports when nothing could be delivered', async () => {
    const realFetch = globalThis.fetch;
    const pushCalls: string[] = [];
    // Only the fake push service is mocked; the database driver also uses fetch.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith('https://push.test/')) return realFetch(input, init);
      pushCalls.push(url);
      return new Response(null, { status: 201 });
    });
    expect((await f.request('/push/test', 'POST', undefined, 0, env())).status).toBe(409);
    await f.request('/push/subscriptions', 'POST', await fakeSubscription(), 0, env());
    const response = await f.request('/push/test', 'POST', undefined, 0, env());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 0, removed: 0 });
    expect(pushCalls).toHaveLength(1);
  });

  it('runs reminders once per slot and day, skips logged meals and drops gone subscriptions', async () => {
    const userId = f.accounts[0]!.user.id;
    const otherId = f.accounts[1]!.user.id;
    const subscription = await fakeSubscription();
    const { kv, store } = memoryKv();
    const cronEnv = {
      ...testEnv,
      ...env(),
      DATABASE_URL: testDatabaseUrl()!,
      PUSH_SCHEDULE: kv,
    };
    expect(
      (await f.request('/profile', 'PUT', { ...completeProfile, timeZone: 'UTC' })).status,
    ).toBe(200);
    await f.request('/push/subscriptions', 'POST', subscription, 0, cronEnv);
    await f.request('/push/subscriptions', 'POST', await fakeSubscription(), 1, cronEnv);
    await f.request(
      '/reminders',
      'PUT',
      { reminders: [{ slot: 'snack', enabled: true, time: '11:00', message: 'Snack!' }] },
      0,
      cronEnv,
    );
    const schedule = JSON.parse(store.get(SCHEDULE_KEY)!) as Schedule;
    expect(schedule.UTC).toContain('11:00');
    const sent: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      sent.push(String(input));
      return new Response(null, { status: 201 });
    });
    const run = (iso: string) =>
      runReminders(cronEnv, f.db, new Date(iso), { fetcher, onlyUserIds: [userId, otherId] });

    // 10:00 UTC: nothing due anywhere, so the database is not touched.
    expect(await run('2026-11-14T10:00:00Z')).toEqual({
      checkedDatabase: false,
      sent: 0,
      skipped: 0,
    });
    // 11:05 UTC: the custom snack reminder of user 0 fires once.
    expect(await run('2026-11-14T11:05:00Z')).toMatchObject({ checkedDatabase: true, sent: 1 });
    expect(sent).toEqual([subscription.endpoint]);
    expect(await run('2026-11-14T11:10:00Z')).toMatchObject({ sent: 0 });
    // Lunch already logged for user 0 is skipped (user 1 lives in Buenos Aires: 10:30 there).
    const food = await f.food();
    await f.entry(food.id!, { date: '2026-11-14', meal: 'lunch' });
    expect(await run('2026-11-14T13:30:00Z')).toMatchObject({ sent: 0, skipped: 1 });
    // Day close: user 0 ate today, so nothing is sent.
    expect(await run('2026-11-14T22:30:00Z')).toMatchObject({ sent: 0, skipped: 1 });
    const deliveries = await f.db
      .select()
      .from(reminderDeliveries)
      .where(and(eq(reminderDeliveries.userId, userId), eq(reminderDeliveries.date, '2026-11-14')));
    expect(deliveries.map((row) => row.slot)).toEqual(['snack']);
    // A 410 from the push service removes the subscription and refreshes the schedule.
    fetcher.mockResolvedValue(new Response(null, { status: 410 }));
    expect(await run('2026-11-15T09:00:00Z')).toMatchObject({ sent: 0 });
    expect(
      await f.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    ).toHaveLength(0);
  });
});
