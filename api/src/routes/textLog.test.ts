import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import type { AppEnv } from '../env';
import { app } from '../index';
import { getFreeModels, savedModels } from '../lib/textLog/freeModels';
import { degradedModels } from '../lib/textLog/health';
import { testEnv } from '../test-env';
import { me } from './auth';
import { textLog } from './textLog';

vi.mock('../db/client', () => ({ getDb: vi.fn() }));
vi.mock('../lib/textLog/freeModels', () => ({ getFreeModels: vi.fn(), savedModels: vi.fn() }));
vi.mock('../lib/textLog/health', () => ({ degradedModels: vi.fn() }));
const state = {
  candidates: ['qwen/a:free'],
  checkedAt: new Date('2026-11-17T12:00:00Z'),
  freeRemaining: 12,
  freeCheckedAt: null,
};
const authorized = new Hono<AppEnv>();
authorized.use('*', async (c, next) => {
  c.set('userId', 'user-a');
  await next();
});
authorized.route('/api/me', me);
authorized.route('/api/text-log', textLog);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getFreeModels).mockResolvedValue(state);
  vi.mocked(savedModels).mockResolvedValue(state);
  vi.mocked(degradedModels).mockResolvedValue([]);
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: () => ({ where: async () => [{ id: 'user-a', username: 'a', displayName: 'A' }] }),
    }),
  } as unknown as ReturnType<typeof getDb>);
});

describe('text log route integration with auth middleware', () => {
  it('protects /status without a session before any catalogue or database access', async () => {
    expect((await app.request('/api/text-log/status', {}, testEnv)).status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
    expect(getFreeModels).not.toHaveBeenCalled();
  });
  it('reports global diagnosis without user data', async () => {
    const response = await authorized.request(
      '/api/text-log/status',
      {},
      { ...testEnv, OPENROUTER_API_KEY: 'fake' },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      candidates: state.candidates,
      degraded: [],
      checkedAt: state.checkedAt.toISOString(),
      freeRemainingToday: 12,
    });
  });
  it('reports unavailable when account quota is exhausted', async () => {
    vi.mocked(getFreeModels).mockResolvedValue({ ...state, freeRemaining: 0 });
    const response = await authorized.request(
      '/api/text-log/status',
      {},
      { ...testEnv, OPENROUTER_API_KEY: 'fake' },
    );
    expect(await response.json()).toMatchObject({ available: false, freeRemainingToday: 0 });
  });
  it.each([true, false])(
    '/me adds features using effective saved candidates, key=%s',
    async (key) => {
      const response = await authorized.request(
        '/api/me',
        {},
        key ? { ...testEnv, OPENROUTER_API_KEY: 'fake' } : testEnv,
      );
      expect(await response.json()).toMatchObject({
        id: 'user-a',
        features: { textLog: true, textLogAi: key },
      });
      expect(getFreeModels).not.toHaveBeenCalled();
      expect(savedModels).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(testEnv));
    },
  );
  it('/me keeps rules enabled when the saved candidate list is empty', async () => {
    vi.mocked(savedModels).mockResolvedValue({ ...state, candidates: [] });
    const response = await authorized.request(
      '/api/me',
      {},
      { ...testEnv, OPENROUTER_API_KEY: 'fake' },
    );
    expect(await response.json()).toMatchObject({ features: { textLog: true, textLogAi: false } });
  });
});

it.each(['legacy', 'records'])(
  'status and /me use the effective %s pool without catalogue access',
  async (format) => {
    const actual = await vi.importActual<typeof import('../lib/textLog/freeModels')>(
      '../lib/textLog/freeModels',
    );
    vi.mocked(getFreeModels).mockImplementation(actual.getFreeModels);
    vi.mocked(savedModels).mockImplementation(actual.savedModels);
    const pool = ['google/a:free', 'qwen/a:free', 'qwen/b:free', 'qwen/c:free', 'other/a:free'];
    const now = new Date();
    const row = {
      ...state,
      checkedAt: now,
      freeCheckedAt: now,
      candidates:
        format === 'legacy'
          ? pool
          : pool.map((id) => ({
              id,
              pricing: { prompt: '0', completion: '0' },
              architecture: { modality: 'text->text' },
            })),
    };
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: (table: unknown) => ({
          where: async () =>
            table === users ? [{ id: 'user-a', username: 'a', displayName: 'A' }] : [row],
        }),
      }),
    } as unknown as ReturnType<typeof getDb>);
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unexpected_network'));
    try {
      for (const scenario of [
        { options: {}, degraded: [], expected: ['google/a:free', 'qwen/a:free', 'qwen/b:free'] },
        {
          options: {
            TEXT_LOG_PREFERRED_MODELS: 'other/*,qwen/*',
            TEXT_LOG_MODEL_DENYLIST: 'qwen/b*',
            TEXT_LOG_MAX_CANDIDATES: '2',
          },
          degraded: ['qwen/a:free'],
          expected: ['other/a:free', 'qwen/c:free'],
        },
        { options: { TEXT_LOG_MODEL_DENYLIST: '*' }, degraded: [], expected: [] },
        { options: {}, degraded: pool, expected: [] },
        {
          options: { OPENROUTER_API_KEY: undefined },
          degraded: [],
          expected: ['google/a:free', 'qwen/a:free', 'qwen/b:free'],
        },
      ]) {
        vi.mocked(degradedModels).mockResolvedValue(scenario.degraded);
        const env = {
          ...testEnv,
          DATABASE_URL: crypto.randomUUID(),
          OPENROUTER_API_KEY: 'fake',
          ...scenario.options,
        };
        const status = await authorized.request('/api/text-log/status', {}, env);
        expect(status.status).toBe(200);
        expect(await status.json()).toMatchObject({
          candidates: scenario.expected,
          available: Boolean(env.OPENROUTER_API_KEY && scenario.expected.length),
          degraded: scenario.degraded,
        });
        const me = await authorized.request('/api/me', {}, env);
        expect(me.status).toBe(200);
        expect(await me.json()).toMatchObject({
          features: {
            textLog: true,
            textLogAi: Boolean(env.OPENROUTER_API_KEY && scenario.expected.length),
          },
        });
      }
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  },
);

it('/me disables AI when account quota is exhausted', async () => {
  vi.mocked(savedModels).mockResolvedValue({ ...state, freeRemaining: 0 });
  const response = await authorized.request(
    '/api/me',
    {},
    { ...testEnv, OPENROUTER_API_KEY: 'fake' },
  );
  expect(await response.json()).toMatchObject({ features: { textLog: true, textLogAi: false } });
});
