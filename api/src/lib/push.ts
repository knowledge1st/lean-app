import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { PushPayload } from '@lean/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { pushSubscriptions, type PushSubscriptionRow } from '../db/schema';
import type { Env } from '../env';

export type PushConfig = { publicKey: string; privateKey: string; subject: string };
export function pushConfig(env: Env): PushConfig | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT || env.ALLOWED_ORIGIN };
}

export type PushOutcome = 'sent' | 'gone' | 'failed';
const PUSH_TIMEOUT_MS = 10_000;
/** Sends one encrypted push message. 404/410 mean the browser dropped the subscription. */
export async function sendPush(
  config: PushConfig,
  subscription: Pick<PushSubscriptionRow, 'endpoint' | 'p256dh' | 'auth'>,
  payload: PushPayload,
  fetcher: typeof fetch = fetch,
): Promise<PushOutcome> {
  try {
    const request = await buildPushPayload(
      { data: payload, options: { ttl: 60 * 60, urgency: 'normal', topic: payload.tag } },
      {
        endpoint: subscription.endpoint,
        expirationTime: null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      config,
    );
    const response = await fetcher(subscription.endpoint, {
      ...request,
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Sends to every subscription of a user and deletes the ones the push service rejected. */
export async function sendToUser(
  db: Db,
  config: PushConfig,
  userId: string,
  payload: PushPayload,
  fetcher: typeof fetch = fetch,
): Promise<{ sent: number; failed: number; removed: number }> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  const outcomes = await Promise.all(rows.map((row) => sendPush(config, row, payload, fetcher)));
  const gone = rows.filter((_, index) => outcomes[index] === 'gone').map((row) => row.id);
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return {
    sent: outcomes.filter((outcome) => outcome === 'sent').length,
    failed: outcomes.filter((outcome) => outcome === 'failed').length,
    removed: gone.length,
  };
}
