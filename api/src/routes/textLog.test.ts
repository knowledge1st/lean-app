import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db/client';
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
  vi.clearAllMocks();
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
  it.each([true, false])('/me adds features using only saved candidates, key=%s', async (key) => {
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
  });
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
