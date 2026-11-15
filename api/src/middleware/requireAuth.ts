import { createMiddleware } from 'hono/factory';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { resolveSession } from '../lib/session';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '');
  if (!match?.[1]) throw new AppError(401, 'unauthorized', 'Sesión inválida o vencida');
  const session = await resolveSession(getDb(c.env), match[1]);
  if (!session) throw new AppError(401, 'unauthorized', 'Sesión inválida o vencida');
  c.set('userId', session.userId);
  c.set('sessionId', session.sessionId);
  await next();
});
