import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../../db/client';
import { testEnv } from '../../test-env';
import {
  filterAndRankModels,
  getFreeModels,
  isFreeModel,
  refreshFreeRemaining,
  type FreeModel,
  type ModelState,
} from './freeModels';
import { degradedModels } from './health';

vi.mock('./health', () => ({ degradedModels: vi.fn(async () => []) }));
const model = (id: string, context_length = 32_000): FreeModel => ({
  id,
  context_length,
  pricing: { prompt: '0', completion: '0' },
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
});
const ids = (models: FreeModel[]) => models.map((m) => m.id);
function storage(initial: ModelState) {
  let state = initial;
  const db = {
    select: () => ({ from: () => ({ where: async () => [state] }) }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async ({ set }: { set: Partial<ModelState> }) => {
          state = { ...state, ...set };
        },
      }),
    }),
  } as unknown as Db;
  return { db, read: () => state };
}
const json = (value: unknown) => Response.json(value);
beforeEach(() => vi.mocked(degradedModels).mockResolvedValue([]));

describe('free model gates and ordering', () => {
  it('requires exact free suffix and both exact zero prices', () => {
    for (const m of [
      model('vendor/paid'),
      { ...model('vendor/a:free'), pricing: { prompt: '0.0', completion: '0' } },
      { ...model('vendor/b:free'), pricing: { prompt: '0', completion: '1' } },
      { ...model('openrouter/free:free'), pricing: { prompt: '-1', completion: '-1' } },
      model('openrouter/auto'),
    ])
      expect(isFreeModel(m)).toBe(false);
    expect(isFreeModel(model('vendor/a:free'))).toBe(true);
  });
  it('ranks preferred patterns before context and ID, applies wildcard denylist and cut', () => {
    const models = [
      model('other/z:free', 100_000),
      model('qwen/z:free'),
      model('google/z:free'),
      model('google/a:free'),
      model('meta-llama/a:free'),
      model('qwen/bad:free'),
    ];
    expect(
      ids(
        filterAndRankModels(models, {
          TEXT_LOG_PREFERRED_MODELS: 'qwen/*,google/*',
          TEXT_LOG_MODEL_DENYLIST: '*/bad:free',
          TEXT_LOG_MAX_CANDIDATES: '4',
        }),
      ),
    ).toEqual(['qwen/z:free', 'google/a:free', 'google/z:free', 'other/z:free']);
  });
  it('filters modalities, small context and degraded models and accepts legacy modality', () => {
    expect(
      ids(
        filterAndRankModels(
          [
            {
              ...model('legacy/a:free'),
              architecture: { modality: 'text+image->text' },
              context_length: null,
            },
            { ...model('image/a:free'), architecture: { modality: 'text->image' } },
            model('small/a:free', 15_999),
            model('bad/a:free'),
          ],
          {},
          ['bad/a:free'],
        ),
      ),
    ).toEqual(['legacy/a:free']);
  });
});

describe('catalogue and saved cache', () => {
  it('falls back to response_format on empty catalogue and saves filtered candidates and quota', async () => {
    const { db, read } = storage({
      candidates: [],
      checkedAt: null,
      freeRemaining: null,
      freeCheckedAt: null,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ data: [model('google/a:free'), model('paid/a')] }))
      .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 12 } } }));
    const result = await getFreeModels({
      db,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
      fetch,
    });
    expect(result.candidates).toEqual(['google/a:free']);
    expect(result.freeRemaining).toBe(12);
    expect(read()).toMatchObject(result);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('structured_outputs');
    expect(String(fetch.mock.calls[1]?.[0])).toContain('response_format');
  });
  it('uses stale saved candidates during outage, throttles refresh to one per minute and excludes new degradation', async () => {
    const saved = {
      candidates: ['google/a:free', 'qwen/a:free'],
      checkedAt: new Date('2020-01-01'),
      freeRemaining: 8,
      freeCheckedAt: null,
    };
    const { db } = storage(saved);
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'));
    let now = new Date('2026-11-17T12:00:00Z');
    const deps = {
      db,
      fetch,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
      now: () => now,
    };
    expect((await getFreeModels(deps)).candidates).toEqual(saved.candidates);
    const calls = fetch.mock.calls.length;
    vi.mocked(degradedModels).mockResolvedValue(['google/a:free']);
    expect((await getFreeModels(deps)).candidates).toEqual(['qwen/a:free']);
    expect(fetch).toHaveBeenCalledTimes(calls);
    now = new Date(now.getTime() + 60_001);
    await getFreeModels(deps);
    expect(fetch.mock.calls.length).toBeGreaterThan(calls);
  });
  it('shares one catalogue renewal across concurrent requests', async () => {
    const { db } = storage({
      candidates: [],
      checkedAt: null,
      freeRemaining: null,
      freeCheckedAt: null,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith('/key')
          ? json({ data: { free_model_daily_requests: { remaining: 12 } } })
          : json({ data: [model('qwen/a:free')] }),
      );
    const deps = {
      db,
      fetch,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
    };
    const results = await Promise.all([getFreeModels(deps), getFreeModels(deps)]);
    expect(results[0]).toEqual(results[1]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses response_format when structured_outputs is unsupported', async () => {
    const { db } = storage({
      candidates: [],
      checkedAt: null,
      freeRemaining: null,
      freeCheckedAt: null,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 400 }))
      .mockResolvedValueOnce(json({ data: [model('qwen/a:free')] }))
      .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 12 } } }));
    const result = await getFreeModels({
      db,
      fetch,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
    });
    expect(result.candidates).toEqual(['qwen/a:free']);
    expect(String(fetch.mock.calls[1]?.[0])).toContain('response_format');
  });

  it('uses fresh saved candidates without network, and refreshes remaining quota explicitly', async () => {
    const { db } = storage({
      candidates: ['qwen/a:free'],
      checkedAt: new Date(),
      freeRemaining: 4,
      freeCheckedAt: null,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json({ data: { free_model_daily_requests: { remaining: 0 } } }));
    const deps = {
      db,
      fetch,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
    };
    await getFreeModels(deps);
    expect(fetch).not.toHaveBeenCalled();
    await refreshFreeRemaining(deps);
    expect((await getFreeModels(deps)).freeRemaining).toBe(0);
  });
});
