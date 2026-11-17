import { pushEndpointSchema, pushSubscriptionInputSchema } from '@lean/shared';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { pushSubscriptions as table } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { pushConfig, sendToUser } from '../lib/push';
import { refreshSchedule } from '../lib/reminders';
import { validate } from '../lib/validate';

const unavailable = () =>
  new AppError(503, 'push_unavailable', 'Las notificaciones no están configuradas');
export const push = new Hono<AppEnv>();
push.get('/public-key', (c) => {
  const config = pushConfig(c.env);
  if (!config) throw unavailable();
  return c.json({ publicKey: config.publicKey });
});
push.post('/subscriptions', validate('json', pushSubscriptionInputSchema), async (c) => {
  if (!pushConfig(c.env)) throw unavailable();
  const { endpoint, keys } = c.req.valid('json');
  const db = getDb(c.env),
    userId = c.get('userId');
  // The same browser can sign in as another user: the endpoint moves to the current one.
  await db
    .insert(table)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: table.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth, updatedAt: sql`now()` },
    });
  await refreshSchedule(c.env, db);
  return c.json({ subscribed: true }, 201);
});
push.delete('/subscriptions', validate('json', pushEndpointSchema), async (c) => {
  const db = getDb(c.env);
  await db
    .delete(table)
    .where(
      and(eq(table.userId, c.get('userId')), eq(table.endpoint, c.req.valid('json').endpoint)),
    );
  await refreshSchedule(c.env, db);
  return c.body(null, 204);
});
push.post('/test', async (c) => {
  const config = pushConfig(c.env);
  if (!config) throw unavailable();
  const db = getDb(c.env);
  const base = (c.env.APP_URL || `${c.env.ALLOWED_ORIGIN}/`).replace(/\/?$/, '/');
  const result = await sendToUser(db, config, c.get('userId'), {
    title: 'Lean',
    body: 'Así se van a ver tus recordatorios.',
    url: `${base}#/perfil`,
    tag: 'test',
  });
  if (result.removed) await refreshSchedule(c.env, db);
  if (!result.sent)
    throw new AppError(
      409,
      'push_not_delivered',
      'No se pudo enviar. Volvé a activar las notificaciones en este dispositivo.',
    );
  return c.json(result);
});
