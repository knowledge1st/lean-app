import type { LoginResponse } from '@lean/shared';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  getTestDb,
  hasTestDatabase,
  testDatabaseUrl,
} from '../../test/helpers/db';
import type { Db } from '../db/client';
import { loginAttempts, sessions } from '../db/schema';
import { app } from '../index';
import { hashToken } from '../lib/session';
import { testEnv } from '../test-env';

const password = 'known-test-password';
const invalidCredentials = {
  error: { code: 'invalid_credentials', message: 'Usuario o contraseña incorrectos' },
};

describe.skipIf(!hasTestDatabase)('auth integration', () => {
  let db: Db;
  let user: Awaited<ReturnType<typeof createTestUser>>['user'] | undefined;
  let ip: string;
  let usernames: string[];
  let ips: string[];
  const currentUser = () => {
    if (!user) throw new Error('Missing test user');
    return user;
  };
  const request = (path: string, init: RequestInit = {}) => {
    const url = testDatabaseUrl();
    if (!url) throw new Error('Missing test database');
    return app.request(path, init, { ...testEnv, DATABASE_URL: url });
  };
  const login = (secret = password, username = currentUser().username, address = ip) =>
    request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': address },
      body: JSON.stringify({ username, password: secret }),
    });
  const loginOk = async () => {
    const response = await login();
    expect(response.status).toBe(200);
    return (await response.json()) as LoginResponse;
  };
  const authorized = (path: string, token: string, body?: unknown) =>
    request(path, {
      method: path === '/api/me' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const sessionRow = async (token: string) => {
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, await hashToken(token)));
    if (!row) throw new Error('Missing test session');
    return row;
  };

  beforeEach(async () => {
    user = undefined;
    usernames = [];
    ip = `10.${Array.from(crypto.getRandomValues(new Uint8Array(3))).join('.')}`;
    ips = [ip];
    db = getTestDb();
    ({ user } = await createTestUser(db, { password }));
    usernames.push(user.username);
  }, 30_000);
  afterEach(async () => {
    try {
      await db
        .delete(loginAttempts)
        .where(or(inArray(loginAttempts.username, usernames), inArray(loginAttempts.ip, ips)));
    } finally {
      if (user) await deleteTestUser(db, user.id);
    }
  }, 30_000);

  it('returns only the public user and authenticates /me with a case-insensitive scheme', async () => {
    const { token, user: publicUser } = await loginOk();
    const expected = {
      id: currentUser().id,
      username: currentUser().username,
      displayName: currentUser().displayName,
    };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(publicUser).toEqual(expected);
    const response = await request('/api/me', { headers: { Authorization: `bEaReR ${token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
    const normalized = await login(password, `  ${currentUser().username.toUpperCase()}  `);
    expect(normalized.status).toBe(200);
    expect(
      await db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.username, currentUser().username)),
    ).toEqual([]);
  }, 30_000);

  it('returns identical errors and records failures for incorrect and nonexistent credentials', async () => {
    const missing = `test_${crypto.randomUUID()}`;
    usernames.push(missing);
    const wrong = await login('wrong');
    const absent = await login('wrong', missing);
    expect(wrong.status).toBe(401);
    expect(absent.status).toBe(401);
    expect(await wrong.json()).toEqual(invalidCredentials);
    expect(await absent.json()).toEqual(invalidCredentials);
    const attempts = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
    expect(attempts.map((row) => row.username).sort()).toEqual(
      [currentUser().username, missing].sort(),
    );
  }, 30_000);

  it('blocks username after five failures even with a different IP and correct password', async () => {
    for (let i = 0; i < 5; i++) expect((await login('wrong')).status).toBe(401);
    const secondIp = `10.${Array.from(crypto.getRandomValues(new Uint8Array(3))).join('.')}`;
    ips.push(secondIp);
    const response = await login(password, currentUser().username, secondIp);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'too_many_requests' } });
    expect(
      await db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.username, currentUser().username)),
    ).toHaveLength(5);
  }, 30_000);

  it('blocks an IP after failures with five distinct usernames', async () => {
    for (let i = 0; i < 5; i++) {
      const username = `test_${crypto.randomUUID()}`;
      usernames.push(username);
      expect((await login('wrong', username)).status).toBe(401);
    }
    const sixth = `test_${crypto.randomUUID()}`;
    usernames.push(sixth);
    expect((await login(password, sixth)).status).toBe(429);
    expect(await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip))).toHaveLength(5);
  }, 30_000);

  it('admits at most one concurrent failure after four failures and stays blocked', async () => {
    for (let i = 0; i < 4; i++) expect((await login('wrong')).status).toBe(401);
    const addresses = Array.from(
      { length: 5 },
      () => `10.${Array.from(crypto.getRandomValues(new Uint8Array(3))).join('.')}`,
    );
    ips.push(...addresses);
    const responses = await Promise.all(
      addresses.map((address) => login('wrong', currentUser().username, address)),
    );
    const failures = responses.filter((response) => response.status === 401).length;
    expect(failures).toBeLessThanOrEqual(1);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(5 - failures);
    expect((await login()).status).toBe(429);
    expect(
      await db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.username, currentUser().username)),
    ).toHaveLength(5);
  }, 30_000);

  it('revokes the current session on logout', async () => {
    const first = await loginOk();
    const second = await loginOk();
    expect((await authorized('/api/auth/logout', first.token)).status).toBe(204);
    expect((await authorized('/api/me', first.token)).status).toBe(401);
    expect((await authorized('/api/me', second.token)).status).toBe(200);
  }, 30_000);

  it('revokes all sessions on logout-all', async () => {
    const first = await loginOk();
    const second = await loginOk();
    expect((await authorized('/api/auth/logout-all', first.token)).status).toBe(204);
    expect((await authorized('/api/me', first.token)).status).toBe(401);
    expect((await authorized('/api/me', second.token)).status).toBe(401);
  }, 30_000);

  it('changes the password and revokes only other sessions', async () => {
    const first = await loginOk();
    const second = await loginOk();
    const newPassword = 'new-known-test-password';
    const wrong = await authorized('/api/auth/password', first.token, {
      currentPassword: 'wrong',
      newPassword,
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual(invalidCredentials);
    const short = await authorized('/api/auth/password', first.token, {
      currentPassword: password,
      newPassword: '123456789',
    });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({
      error: {
        code: 'validation_error',
        message: 'newPassword: La contraseña nueva debe tener al menos 10 caracteres',
      },
    });
    expect((await authorized('/api/me', second.token)).status).toBe(200);
    const response = await authorized('/api/auth/password', first.token, {
      currentPassword: password,
      newPassword,
    });
    expect(response.status).toBe(204);
    expect((await authorized('/api/me', first.token)).status).toBe(200);
    expect((await authorized('/api/me', second.token)).status).toBe(401);
    expect((await login(newPassword)).status).toBe(200);
    expect((await login(password)).status).toBe(401);
  }, 30_000);

  it('rejects expired sessions', async () => {
    const { token } = await loginOk();
    const row = await sessionRow(token);
    await db
      .update(sessions)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(sessions.id, row.id));
    expect((await authorized('/api/me', token)).status).toBe(401);
  }, 30_000);

  it('stores SHA-256 hashes and never plaintext tokens', async () => {
    const { token } = await loginOk();
    expect(await db.select().from(sessions).where(eq(sessions.tokenHash, token))).toEqual([]);
    const rows = await db.select().from(sessions).where(eq(sessions.userId, currentUser().id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(await hashToken(token));
  }, 30_000);

  it('protects routes with missing or invalid tokens while health stays public', async () => {
    for (const path of ['/api/me', '/api/auth/logout']) {
      for (const headers of [{}, { Authorization: 'Bearer basura' }]) {
        const response = await request(path, {
          method: path === '/api/me' ? 'GET' : 'POST',
          headers,
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          error: { code: 'unauthorized', message: 'Sesión inválida o vencida' },
        });
      }
    }
    expect((await request('/api/health')).status).toBe(200);
    expect((await request('/api/health/db')).status).toBe(200);
  }, 30_000);

  it('renews stale sessions using database time, at most once per hour', async () => {
    const { token } = await loginOk();
    const row = await sessionRow(token);
    await db
      .update(sessions)
      .set({
        lastUsedAt: sql`now() - interval '2 hours'`,
        expiresAt: sql`now() + interval '1 day'`,
      })
      .where(eq(sessions.id, row.id));
    expect((await authorized('/api/me', token)).status).toBe(200);
    const [timing] = await db
      .select({
        refreshed: sql<boolean>`${sessions.lastUsedAt} BETWEEN now() - interval '1 minute' AND now()`,
        extended: sql<boolean>`${sessions.expiresAt} BETWEEN now() + interval '30 days' - interval '1 minute' AND now() + interval '30 days'`,
      })
      .from(sessions)
      .where(eq(sessions.id, row.id));
    expect(timing).toEqual({ refreshed: true, extended: true });
    const renewed = await sessionRow(token);
    expect((await authorized('/api/me', token)).status).toBe(200);
    const unchanged = await sessionRow(token);
    expect(unchanged.lastUsedAt).toEqual(renewed.lastUsedAt);
    expect(unchanged.expiresAt).toEqual(renewed.expiresAt);
  }, 30_000);

  it('cleans expired sessions and day-old attempts while retaining recent failures', async () => {
    const { token } = await loginOk();
    const row = await sessionRow(token);
    await db
      .update(sessions)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(sessions.id, row.id));
    await db.insert(loginAttempts).values([
      { username: currentUser().username, ip, createdAt: sql`now() - interval '2 days'` },
      { username: currentUser().username, ip, createdAt: sql`now() - interval '1 minute'` },
    ]);
    expect((await login()).status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.id, row.id))).toEqual([]);
    expect(
      await db
        .select()
        .from(loginAttempts)
        .where(and(eq(loginAttempts.username, currentUser().username), eq(loginAttempts.ip, ip))),
    ).toHaveLength(1);
  }, 30_000);
});
