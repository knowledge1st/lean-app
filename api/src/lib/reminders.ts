import {
  DEFAULT_REMINDERS,
  DEFAULT_TIME_ZONE,
  REMINDER_SLOTS,
  type PushPayload,
  type Reminder,
  type ReminderSlot,
} from '@lean/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  mealEntries,
  profiles,
  pushSubscriptions,
  reminderDeliveries,
  reminders,
  type ReminderRow,
} from '../db/schema';
import type { Env } from '../env';
import { pushConfig, sendToUser, type PushConfig } from './push';

/** The cron runs every 5 minutes; a 10-minute window absorbs one late or missed run. */
export const REMINDER_WINDOW_MINUTES = 10;
export const SCHEDULE_KEY = 'schedule:v1';
const MEAL_LABELS: Record<Exclude<ReminderSlot, 'day_close'>, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  afternoon_snack: 'Merienda',
  dinner: 'Cena',
  snack: 'Snack',
};

export function mergeReminders(
  rows: readonly Pick<ReminderRow, 'slot' | 'enabled' | 'time' | 'message'>[],
): Reminder[] {
  return REMINDER_SLOTS.map((slot) => {
    const row = rows.find((item) => item.slot === slot);
    const fallback = DEFAULT_REMINDERS[slot];
    return {
      slot,
      enabled: row?.enabled ?? fallback.enabled,
      time: row?.time ?? fallback.time,
      message: row?.message ?? null,
      defaultMessage: fallback.message,
    };
  });
}

export function localClock(timeZone: string, at: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** Due from the reminder minute until the window closes; never across midnight. */
export function isDue(time: string, nowMinutes: number): boolean {
  const diff = nowMinutes - toMinutes(time);
  return diff >= 0 && diff < REMINDER_WINDOW_MINUTES;
}

type Subscriber = { userId: string; timeZone: string; reminders: Reminder[] };
/** Users with at least one push subscription, with their time zone and effective reminders. */
export async function loadSubscribers(
  db: Db,
  onlyUserIds?: readonly string[],
): Promise<Subscriber[]> {
  const users = await db
    .selectDistinct({ userId: pushSubscriptions.userId, timeZone: profiles.timeZone })
    .from(pushSubscriptions)
    .leftJoin(profiles, eq(profiles.userId, pushSubscriptions.userId))
    .where(onlyUserIds ? inArray(pushSubscriptions.userId, [...onlyUserIds]) : undefined);
  if (!users.length) return [];
  const rows = await db
    .select()
    .from(reminders)
    .where(
      inArray(
        reminders.userId,
        users.map((user) => user.userId),
      ),
    );
  return users.map(({ userId, timeZone }) => ({
    userId,
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
    reminders: mergeReminders(rows.filter((row) => row.userId === userId)),
  }));
}

/** Distinct enabled times per time zone. Small enough to read from KV on every cron run. */
export type Schedule = Record<string, string[]>;
export function buildSchedule(subscribers: readonly Subscriber[]): Schedule {
  const schedule: Schedule = {};
  for (const { timeZone, reminders: items } of subscribers) {
    const times = new Set(schedule[timeZone]);
    for (const item of items) if (item.enabled) times.add(item.time);
    if (times.size) schedule[timeZone] = [...times].sort();
  }
  return schedule;
}
export function scheduleHasDue(schedule: Schedule, at: Date): boolean {
  return Object.entries(schedule).some(([timeZone, times]) => {
    const { minutes } = localClock(timeZone, at);
    return times.some((time) => isDue(time, minutes));
  });
}

/** Rebuilds the cached schedule after a change to reminders, subscriptions or time zone. */
export async function refreshSchedule(env: Env, db: Db): Promise<void> {
  if (!env.PUSH_SCHEDULE) return;
  await env.PUSH_SCHEDULE.put(
    SCHEDULE_KEY,
    JSON.stringify(buildSchedule(await loadSubscribers(db))),
  );
}
async function readSchedule(env: Env, db: Db): Promise<Schedule | null> {
  if (!env.PUSH_SCHEDULE) return null;
  const cached = await env.PUSH_SCHEDULE.get<Schedule>(SCHEDULE_KEY, 'json');
  if (cached) return cached;
  const schedule = buildSchedule(await loadSubscribers(db));
  await env.PUSH_SCHEDULE.put(SCHEDULE_KEY, JSON.stringify(schedule));
  return schedule;
}

async function alreadyLogged(db: Db, userId: string, date: string, slot: ReminderSlot) {
  const condition =
    slot === 'day_close'
      ? and(
          eq(mealEntries.userId, userId),
          eq(mealEntries.date, date),
          eq(mealEntries.status, 'eaten'),
        )
      : and(eq(mealEntries.userId, userId), eq(mealEntries.date, date), eq(mealEntries.meal, slot));
  const [row] = await db.select({ id: mealEntries.id }).from(mealEntries).where(condition).limit(1);
  return !!row;
}

export function reminderPayload(env: Env, reminder: Reminder): PushPayload {
  const base = (env.APP_URL || `${env.ALLOWED_ORIGIN}/`).replace(/\/?$/, '/');
  return {
    title: reminder.slot === 'day_close' ? 'Lean' : `Lean · ${MEAL_LABELS[reminder.slot]}`,
    body: reminder.message ?? reminder.defaultMessage,
    url: `${base}#/hoy`,
    tag: `reminder-${reminder.slot}`,
  };
}

export type ReminderRun = { checkedDatabase: boolean; sent: number; skipped: number };
/** Cron entry point: sends the reminders due at `at`, at most once per slot and local day. */
export async function runReminders(
  env: Env,
  db: Db,
  at: Date,
  options: { fetcher?: typeof fetch; onlyUserIds?: readonly string[] } = {},
): Promise<ReminderRun> {
  const fetcher = options.fetcher ?? fetch;
  const config: PushConfig | null = pushConfig(env);
  const result: ReminderRun = { checkedDatabase: false, sent: 0, skipped: 0 };
  if (!config) return result;
  const schedule = await readSchedule(env, db);
  if (schedule && !scheduleHasDue(schedule, at)) return result;
  result.checkedDatabase = true;
  for (const subscriber of await loadSubscribers(db, options.onlyUserIds)) {
    const { date, minutes } = localClock(subscriber.timeZone, at);
    for (const reminder of subscriber.reminders) {
      if (!reminder.enabled || !isDue(reminder.time, minutes)) continue;
      if (await alreadyLogged(db, subscriber.userId, date, reminder.slot)) {
        result.skipped += 1;
        continue;
      }
      const claimed = await db
        .insert(reminderDeliveries)
        .values({ userId: subscriber.userId, slot: reminder.slot, date })
        .onConflictDoNothing()
        .returning({ id: reminderDeliveries.id });
      if (!claimed.length) continue;
      const outcome = await sendToUser(
        db,
        config,
        subscriber.userId,
        reminderPayload(env, reminder),
        fetcher,
      );
      result.sent += outcome.sent;
      if (outcome.removed) await refreshSchedule(env, db);
    }
  }
  return result;
}
