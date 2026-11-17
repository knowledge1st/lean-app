import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDERS,
  pushSubscriptionInputSchema,
  REMINDER_SLOTS,
  updateRemindersSchema,
} from './reminders';

const item = { slot: 'lunch', enabled: true, time: '13:30', message: null };
describe('updateRemindersSchema', () => {
  it('accepts valid reminders and turns a blank message into the default', () => {
    expect(
      updateRemindersSchema.parse({ reminders: [{ ...item, message: '   ' }] }).reminders[0],
    ).toEqual(item);
    expect(
      updateRemindersSchema.parse({ reminders: [{ ...item, message: ' Hola ' }] }).reminders[0]
        ?.message,
    ).toBe('Hola');
  });
  it.each([
    { reminders: [] },
    { reminders: [item, item] },
    { reminders: [{ ...item, time: '24:00' }] },
    { reminders: [{ ...item, time: '9:00' }] },
    { reminders: [{ ...item, slot: 'brunch' }] },
    { reminders: [{ ...item, message: 'x'.repeat(121) }] },
    { reminders: [{ ...item, extra: true }] },
  ])('rejects %o', (body) => {
    expect(updateRemindersSchema.safeParse(body).success).toBe(false);
  });
});
describe('DEFAULT_REMINDERS', () => {
  it('defines every slot with a valid time and message', () => {
    for (const slot of REMINDER_SLOTS) {
      const reminder = DEFAULT_REMINDERS[slot];
      expect(updateRemindersSchema.safeParse({ reminders: [{ slot, ...reminder }] }).success).toBe(
        true,
      );
    }
    expect(DEFAULT_REMINDERS.snack.enabled).toBe(false);
  });
});
describe('pushSubscriptionInputSchema', () => {
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BAbc-_', auth: 'xyz' } };
  it('accepts an https subscription', () => {
    expect(pushSubscriptionInputSchema.parse(sub)).toEqual(sub);
  });
  it.each([
    { ...sub, endpoint: 'http://push.example/abc' },
    { ...sub, keys: { p256dh: 'no válida', auth: 'x' } },
    { endpoint: sub.endpoint },
  ])('rejects %o', (body) => {
    expect(pushSubscriptionInputSchema.safeParse(body).success).toBe(false);
  });
});
