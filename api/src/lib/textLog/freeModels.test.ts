import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../../db/client';
import { testEnv } from '../../test-env';
import {
  filterAndRankModels,
  getFreeModels,
  isFreeModel,
  refreshFreeRemaining,
  savedModels,
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
type StoredState = Omit<ModelState, 'candidates'> & { candidates: (string | FreeModel)[] };
function storage(initial: StoredState) {
  let state = initial;
  const db = {
    select: () => ({ from: () => ({ where: async () => [state] }) }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async ({ set }: { set: Partial<StoredState> }) => {
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
    expect(read()).toMatchObject({
      checkedAt: result.checkedAt, freeRemaining: 12, candidates: [model('google/a:free')],
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain('structured_outputs');
    expect(String(fetch.mock.calls[1]?.[0])).toContain('response_format');
  });
  it('preserves reasoning support through discovery, memory and saved records', async () => {
    const now = new Date('2026-11-17T12:00:00Z');
    const { db, read } = storage({
      candidates: [], checkedAt: null, freeRemaining: null, freeCheckedAt: null,
    });
    const pool = [
      { ...model('google/a:free'), supported_parameters: ['response_format', 'reasoning'] },
      { ...model('qwen/a:free'), supported_parameters: ['response_format'] },
      model('other/a:free'),
    ];
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ data: pool }))
      .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 12 } } }));
    const deps = {
      db, fetch, now: () => now,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
    };
    const expected = { 'google/a:free': true, 'qwen/a:free': false, 'other/a:free': false };
    expect((await getFreeModels(deps)).reasoningSupported).toEqual(expected);
    expect(read().candidates).toEqual(pool);
    expect((await getFreeModels(deps)).reasoningSupported).toEqual(expected);
    expect((await savedModels(db)).reasoningSupported).toEqual(expected);
    // A different cache key loads the persisted pool without catalogue access.
    expect((await getFreeModels({ ...deps, env: { ...deps.env,
      TEXT_LOG_PREFERRED_MODELS: 'qwen/*',
    } })).reasoningSupported).toEqual(expected);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('treats legacy IDs and records without supported parameters as unsupported', async () => {
    const { db } = storage({
      candidates: ['google/a:free', model('qwen/a:free')],
      checkedAt: new Date(), freeRemaining: 8, freeCheckedAt: null,
    });
    expect((await savedModels(db)).reasoningSupported).toEqual({
      'google/a:free': false, 'qwen/a:free': false,
    });
  });
  it('reapplies current preferences, denylist, health and maximum to legacy saved IDs', async () => {
    const now = new Date('2026-11-17T12:00:00Z');
    const { db } = storage({
      candidates: ['google/a:free', 'qwen/a:free', 'qwen/b:free', 'qwen/c:free', 'paid/a'],
      checkedAt: now, freeRemaining: 8, freeCheckedAt: now,
    });
    vi.mocked(degradedModels).mockResolvedValue(['qwen/a:free']);
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = await getFreeModels({
      db, fetch, now: () => now,
      env: {
        ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake',
        TEXT_LOG_PREFERRED_MODELS: 'qwen/*',
        TEXT_LOG_MODEL_DENYLIST: 'qwen/b*', TEXT_LOG_MAX_CANDIDATES: '1',
      },
    });
    expect(result.candidates).toEqual(['qwen/c:free']);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('persists the eligible pool and context for configuration changes on a fresh cache', async () => {
    const now = new Date('2026-11-17T12:00:00Z');
    const { db, read } = storage({
      candidates: [], checkedAt: null, freeRemaining: null, freeCheckedAt: null,
    });
    const pool = [model('google/a:free'), model('qwen/z:free', 64_000),
      model('qwen/a:free'), model('other/a:free')];
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ data: [...pool, model('paid/a'), model('small/a:free', 100)] }))
      .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 12 } } }));
    const deps = {
      db, fetch, now: () => now,
      env: {
        ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake',
        TEXT_LOG_MAX_CANDIDATES: '1', TEXT_LOG_MODEL_DENYLIST: 'qwen/*',
      },
    };
    vi.mocked(degradedModels).mockResolvedValue(['other/a:free']);
    expect((await getFreeModels(deps)).candidates).toEqual(['google/a:free']);
    expect(read().candidates).toHaveLength(4);
    expect((await savedModels(db)).candidates).toEqual(pool.map((m) => m.id));
    vi.mocked(degradedModels).mockResolvedValue([]);
    const updated = { ...deps, env: { ...deps.env,
      TEXT_LOG_PREFERRED_MODELS: 'qwen/*', TEXT_LOG_MODEL_DENYLIST: '',
      TEXT_LOG_MAX_CANDIDATES: '4',
    } };
    expect((await getFreeModels(updated)).candidates).toEqual([
      'qwen/z:free', 'qwen/a:free', 'google/a:free', 'other/a:free',
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['previous UTC day', 'older than 15 minutes', 'unknown check time'])(
    'refreshes exhausted quota with a fresh catalogue when check is %s', async (when) => {
      let now = new Date('2026-11-18T00:01:00Z');
      const checked = when === 'previous UTC day' ? new Date('2026-11-17T23:59:00Z')
        : when === 'older than 15 minutes' ? new Date(now.getTime() - 900_001) : null;
      const { db, read } = storage({
        candidates: ['qwen/a:free'], checkedAt: now, freeRemaining: 0, freeCheckedAt: checked,
      });
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 0 } } }))
        .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 12 } } }));
      const deps = {
        db, fetch, now: () => now,
        env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
      };
      const results = await Promise.all([getFreeModels(deps), getFreeModels(deps)]);
      expect(results.map((state) => state.freeRemaining)).toEqual([0, 0]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1/key');
      now = new Date(now.getTime() + 30_000);
      await getFreeModels({ ...deps, env: { ...deps.env, TEXT_LOG_MAX_CANDIDATES: '1' } });
      expect(fetch).toHaveBeenCalledTimes(1);
      now = new Date(now.getTime() + 900_001);
      expect((await getFreeModels(deps)).freeRemaining).toBe(12);
      expect(read().freeRemaining).toBe(12);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('detects daily renewal across midnight UTC before the catalogue expires', async () => {
    let now = new Date('2026-11-17T23:59:00Z');
    const { db } = storage({
      candidates: ['qwen/a:free'], checkedAt: now,
      freeRemaining: 0, freeCheckedAt: now,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      json({ data: { free_model_daily_requests: { remaining: 1000 } } }),
    );
    const deps = {
      db, fetch, now: () => now,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
    };
    expect((await getFreeModels(deps)).freeRemaining).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    now = new Date('2026-11-18T00:00:00Z');
    expect((await getFreeModels(deps)).freeRemaining).toBe(1000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1/key');
  });
  it('throttles failed exhausted-quota refreshes across preference variants and retries after a minute', async () => {
    let now = new Date('2026-11-18T00:01:00Z');
    const { db } = storage({
      candidates: ['qwen/a:free'], checkedAt: now, freeRemaining: 0,
      freeCheckedAt: new Date('2026-11-17T23:59:00Z'),
    });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ data: { free_model_daily_requests: { remaining: 12 } } }));
    const deps = { db, fetch, now: () => now,
      env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' } };
    expect((await getFreeModels(deps)).freeRemaining).toBe(0);
    now = new Date(now.getTime() + 59_999);
    expect((await getFreeModels({ ...deps,
      env: { ...deps.env, TEXT_LOG_PREFERRED_MODELS: 'qwen/*' },
    })).freeRemaining).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 1);
    expect((await getFreeModels(deps)).freeRemaining).toBe(12);
    expect(fetch).toHaveBeenCalledTimes(2);
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

  it.each(['catalogue', 'quota', 'body'])(
    'bounds each discovery query to 5 seconds, including %s', async (stage) => {
      vi.useFakeTimers();
      try {
        const { db } = storage({
          candidates: ['qwen/a:free'], checkedAt: null, freeRemaining: 4, freeCheckedAt: null,
        });
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
          const quota = String(url).endsWith('/key');
          if ((stage === 'catalogue' && !quota) || (stage === 'quota' && quota))
            return new Promise(() => {});
          if (stage === 'body' && !quota)
            return { ok: true, json: () => new Promise(() => {}) } as Response;
          return quota
            ? json({ data: { free_model_daily_requests: { remaining: 12 } } })
            : json({ data: [model('qwen/a:free')] });
        });
        let settled = false;
        const pending = getFreeModels({
          db, fetch,
          env: { ...testEnv, DATABASE_URL: crypto.randomUUID(), OPENROUTER_API_KEY: 'fake' },
        }).then((result) => { settled = true; return result; });
        await vi.advanceTimersByTimeAsync(4_999);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect((await pending).candidates).toEqual(['qwen/a:free']);
        const hung = fetch.mock.calls.find(([url]) => String(url).endsWith('/key') === (stage === 'quota'));
        expect(hung?.[1]?.signal?.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );

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
