import { DEFAULT_REMINDERS } from '@lean/shared';
import { describe, expect, it, vi } from 'vitest';
import { fakeSubscription, generateVapidKeys } from '../../test/helpers/push';
import { testEnv } from '../test-env';
import { sendPush } from './push';
import {
  buildSchedule,
  isDue,
  localClock,
  mergeReminders,
  reminderPayload,
  scheduleHasDue,
} from './reminders';

describe('mergeReminders', () => {
  it('fills every slot with the defaults and keeps the stored changes', () => {
    const merged = mergeReminders([
      { slot: 'lunch', enabled: false, time: '14:05', message: 'Comé algo' },
    ]);
    expect(merged.map((item) => item.slot)).toEqual([
      'breakfast',
      'lunch',
      'afternoon_snack',
      'dinner',
      'snack',
      'day_close',
    ]);
    expect(merged[0]).toEqual({
      slot: 'breakfast',
      ...DEFAULT_REMINDERS.breakfast,
      message: null,
      defaultMessage: DEFAULT_REMINDERS.breakfast.message,
    });
    expect(merged[1]).toMatchObject({ enabled: false, time: '14:05', message: 'Comé algo' });
  });
});

describe('localClock and isDue', () => {
  it('uses the time zone for date and minutes', () => {
    // 2026-11-17 02:10 UTC is 23:10 of the 16th in Buenos Aires (UTC−3).
    expect(localClock('America/Argentina/Buenos_Aires', new Date('2026-11-17T02:10:00Z'))).toEqual({
      date: '2026-11-16',
      minutes: 23 * 60 + 10,
    });
    expect(localClock('UTC', new Date('2026-11-17T00:00:00Z'))).toEqual({
      date: '2026-11-17',
      minutes: 0,
    });
  });
  it.each([
    ['13:30', 13 * 60 + 30, true],
    ['13:30', 13 * 60 + 39, true],
    ['13:30', 13 * 60 + 40, false],
    ['13:30', 13 * 60 + 29, false],
    ['23:55', 2, false],
  ])('%s at minute %i → %s', (time, minutes, due) => {
    expect(isDue(time, minutes)).toBe(due);
  });
});

describe('schedule cache', () => {
  const reminders = mergeReminders([]);
  it('keeps the distinct enabled times per time zone', () => {
    const schedule = buildSchedule([
      { userId: 'a', timeZone: 'UTC', reminders },
      {
        userId: 'b',
        timeZone: 'UTC',
        reminders: mergeReminders([{ slot: 'snack', enabled: true, time: '11:00', message: null }]),
      },
      {
        userId: 'c',
        timeZone: 'Asia/Tokyo',
        reminders: reminders.map((r) => ({ ...r, enabled: false })),
      },
    ]);
    expect(schedule).toEqual({ UTC: ['09:00', '11:00', '13:30', '17:30', '21:30', '22:30'] });
    expect(scheduleHasDue(schedule, new Date('2026-11-17T13:35:00Z'))).toBe(true);
    expect(scheduleHasDue(schedule, new Date('2026-11-17T14:00:00Z'))).toBe(false);
    expect(scheduleHasDue({}, new Date('2026-11-17T13:35:00Z'))).toBe(false);
  });
});

describe('reminderPayload', () => {
  it('opens Hoy in the web app and uses the custom or default message', () => {
    const [breakfast] = mergeReminders([]);
    expect(
      reminderPayload({ ...testEnv, APP_URL: 'https://example.test/lean-app' }, breakfast!),
    ).toEqual({
      title: 'Lean · Desayuno',
      body: DEFAULT_REMINDERS.breakfast.message,
      url: 'https://example.test/lean-app/#/hoy',
      tag: 'reminder-breakfast',
    });
    const close = mergeReminders([
      { slot: 'day_close', enabled: true, time: '22:30', message: 'Cerrá el día' },
    ])[5]!;
    expect(reminderPayload(testEnv, close)).toMatchObject({
      title: 'Lean',
      body: 'Cerrá el día',
      url: `${testEnv.ALLOWED_ORIGIN}/#/hoy`,
    });
  });
});

describe('sendPush', () => {
  it('encrypts the payload with VAPID and maps the push service answer', async () => {
    const keys = await generateVapidKeys();
    const config = {
      publicKey: keys.VAPID_PUBLIC_KEY,
      privateKey: keys.VAPID_PRIVATE_KEY,
      subject: 'https://example.test/',
    };
    const { endpoint, keys: subKeys } = await fakeSubscription();
    const subscription = { endpoint, ...subKeys };
    const payload = { title: 'Lean', body: 'Hola', url: 'https://example.test/#/hoy', tag: 't' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    expect(await sendPush(config, subscription, payload, fetcher)).toBe('sent');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(endpoint);
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(headers['content-encoding']).toBe('aes128gcm');
    expect(headers.topic).toBe('t');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 410 }));
    expect(await sendPush(config, subscription, payload, fetcher)).toBe('gone');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await sendPush(config, subscription, payload, fetcher)).toBe('gone');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await sendPush(config, subscription, payload, fetcher)).toBe('failed');
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await sendPush(config, subscription, payload, fetcher)).toBe('failed');
  });
});
