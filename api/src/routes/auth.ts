import { changePasswordRequestSchema, loginRequestSchema } from '@lean/shared';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { cleanupOldAttempts, registerLoginAttempt, removeLoginAttempt } from '../lib/rateLimit';
import {
  cleanupExpiredSessions,
  createSession,
  revokeAllSessions,
  revokeSession,
} from '../lib/session';
import { validate } from '../lib/validate';

const publicFields = { id: users.id, username: users.username, displayName: users.displayName };
const dummyPasswordHash = '$2a$10$hlBoadn2l7d58BdD1T4cheuiEtQ9TmsfOjccUQVbq6quJR8lRpbqy';
const invalidCredentials = () =>
  new AppError(401, 'invalid_credentials', 'Usuario o contraseña incorrectos');
export const auth = new Hono<AppEnv>();

auth.post('/login', validate('json', loginRequestSchema), async (c) => {
  const db = getDb(c.env);
  const { username, password } = c.req.valid('json');
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  try {
    const attempt = await registerLoginAttempt(db, username, ip);
    if (attempt.blocked) {
      await removeLoginAttempt(db, attempt.id);
      throw new AppError(429, 'too_many_requests', 'Demasiados intentos de inicio de sesión');
    }
    // Materialization forces exactly one bcrypt check even for an absent user,
    // so the password verification time does not reveal whether it exists.
    const result = await db.execute<{
      id: string;
      username: string;
      displayName: string;
    }>(sql`
      WITH checked AS MATERIALIZED (
        SELECT u.id, u.username, u.display_name, u.password_hash,
          crypt(${password}, COALESCE(u.password_hash, ${dummyPasswordHash})) AS checked_hash
        FROM (VALUES (1)) AS seed(n)
        LEFT JOIN users u ON u.username = ${username}
      )
      SELECT id, username, display_name AS "displayName" FROM checked
      WHERE id IS NOT NULL AND password_hash = checked_hash
    `);
    const user = result.rows[0];
    if (!user) {
      throw invalidCredentials();
    }
    await removeLoginAttempt(db, attempt.id);
    const token = await createSession(db, user.id);
    return c.json({ token, user });
  } finally {
    // Cleanup failures must neither change the response nor log SQL parameters.
    await Promise.allSettled([cleanupOldAttempts(db), cleanupExpiredSessions(db)]);
  }
});
auth.post('/logout', async (c) => {
  await revokeSession(getDb(c.env), c.get('sessionId'));
  return c.body(null, 204);
});
auth.post('/logout-all', async (c) => {
  await revokeAllSessions(getDb(c.env), c.get('userId'));
  return c.body(null, 204);
});
auth.post('/password', validate('json', changePasswordRequestSchema), async (c) => {
  const { currentPassword, newPassword } = c.req.valid('json');
  // One statement makes the password change and revocation atomic on Neon HTTP.
  const result = await getDb(c.env).execute<{ id: string }>(sql`
    WITH changed AS (
      UPDATE users SET password_hash = crypt(${newPassword}, gen_salt('bf', 10))
      WHERE id = ${c.get('userId')} AND password_hash = crypt(${currentPassword}, password_hash)
      RETURNING id
    ), revoked AS (
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM changed)
        AND id <> ${c.get('sessionId')}
    )
    SELECT id FROM changed
  `);
  if (!result.rows.length) throw invalidCredentials();
  return c.body(null, 204);
});

export const me = new Hono<AppEnv>();
me.get('/', async (c) => {
  const [user] = await getDb(c.env)
    .select(publicFields)
    .from(users)
    .where(eq(users.id, c.get('userId')));
  if (!user) throw new AppError(401, 'unauthorized', 'Sesión inválida o vencida');
  return c.json({
    ...user,
    features: {
      textLog: true,
      textLogAi: Boolean(c.env.OPENROUTER_API_KEY),
      photoLog: Boolean(c.env.OPENROUTER_API_KEY),
    },
  });
});
