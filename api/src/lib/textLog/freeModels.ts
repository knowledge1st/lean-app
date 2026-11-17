import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { textLogModels } from '../../db/schema';
import type { Env } from '../../env';
import { degradedModels } from './health';

export type ModelOptions = Pick<
  Env,
  'TEXT_LOG_PREFERRED_MODELS' | 'TEXT_LOG_MODEL_DENYLIST' | 'TEXT_LOG_MAX_CANDIDATES'
>;
export interface TextLogDeps {
  db: Db;
  env: Env;
  fetch?: typeof fetch;
  now?: () => Date;
  waitUntil?: (p: Promise<unknown>) => void;
}
export interface ModelState {
  candidates: string[];
  reasoningSupported?: Record<string, boolean>;
  checkedAt: Date | null;
  freeRemaining: number | null;
  freeCheckedAt: Date | null;
}
const modelSchema = z.object({
  id: z.string(),
  supported_parameters: z.array(z.string()).optional(),
  pricing: z
    .object({ prompt: z.string().optional(), completion: z.string().optional() })
    .optional(),
  context_length: z.number().nullable().optional(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
      modality: z.string().optional(),
    })
    .optional(),
});
export type FreeModel = z.infer<typeof modelSchema>;
const catalogSchema = z.object({ data: z.array(z.unknown()) });
const patterns = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const matches = (id: string, pattern: string) =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  ).test(id);

export function isFreeModel(model: FreeModel): boolean {
  return (
    model.id !== 'openrouter/auto' &&
    model.id.endsWith(':free') &&
    model.pricing?.prompt === '0' &&
    model.pricing.completion === '0'
  );
}

export function filterAndRankModels(
  models: readonly FreeModel[],
  options: ModelOptions = {},
  degraded: readonly string[] = [],
): FreeModel[] {
  const preferred = patterns(
    options.TEXT_LOG_PREFERRED_MODELS ?? 'meta-llama/*,google/*,qwen/*,mistralai/*,deepseek/*',
  );
  const denied = patterns(options.TEXT_LOG_MODEL_DENYLIST);
  const rank = (id: string) => {
    const i = preferred.findIndex((p) => matches(id, p));
    return i < 0 ? preferred.length : i;
  };
  const max = Number(options.TEXT_LOG_MAX_CANDIDATES ?? 3);
  return [
    ...new Map(
      models
        .filter((m) => {
          const a = m.architecture;
          const [input, output] = (a?.modality ?? '').split('->');
          return (
            isFreeModel(m) &&
            (m.context_length == null || m.context_length >= 16_000) &&
            (a?.input_modalities
              ? a.input_modalities.includes('text')
              : input?.split('+').includes('text')) &&
            (a?.output_modalities
              ? a.output_modalities.includes('text')
              : output?.split('+').includes('text')) &&
            !denied.some((p) => matches(m.id, p)) &&
            !degraded.includes(m.id)
          );
        })
        .map((m) => [m.id, m]),
    ).values(),
  ]
    .sort(
      (a, b) =>
        rank(a.id) - rank(b.id) ||
        (b.context_length ?? 0) - (a.context_length ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, Number.isInteger(max) && max > 0 ? max : 3);
}

type SavedModelState = Omit<ModelState, 'candidates'> & { candidates: FreeModel[] };
interface CacheEntry {
  state: SavedModelState;
  attemptedAt?: number;
  pending?: Promise<ModelState>;
}
const cache = new Map<string, CacheEntry>();
const loading = new Map<string, Promise<CacheEntry>>();
const cacheKey = ({ env }: TextLogDeps) =>
  JSON.stringify([
    env.DATABASE_URL,
    env.TEXT_LOG_PREFERRED_MODELS,
    env.TEXT_LOG_MODEL_DENYLIST,
    env.TEXT_LOG_MAX_CANDIDATES,
  ]);

async function loadSavedModels(db: Db): Promise<SavedModelState> {
  const [row] = await db.select().from(textLogModels).where(eq(textLogModels.id, 1));
  if (!row) return { candidates: [], checkedAt: null, freeRemaining: null, freeCheckedAt: null };
  // Older rows contain IDs only. They already passed discovery's free/text gates.
  const candidates = (row.candidates as unknown[]).flatMap((value) => {
    const parsed = modelSchema.safeParse(typeof value === 'string' ? {
      id: value,
      pricing: { prompt: '0', completion: '0' },
      architecture: { modality: 'text->text' },
    } : value);
    return parsed.success ? [parsed.data] : [];
  });
  return { ...row, candidates };
}

function modelState(state: SavedModelState): ModelState {
  return {
    ...state,
    candidates: state.candidates.map((model) => model.id),
    reasoningSupported: Object.fromEntries(
      state.candidates.map((model) => [
        model.id,
        model.supported_parameters?.includes('reasoning') ?? false,
      ]),
    ),
  };
}

function effectiveState(
  state: SavedModelState,
  options: ModelOptions,
  degraded: readonly string[],
): ModelState {
  return modelState({
    ...state,
    candidates: filterAndRankModels(state.candidates, options, degraded),
  });
}

export async function savedModels(
  db: Db,
  options?: ModelOptions,
  now = new Date(),
): Promise<ModelState> {
  const state = await loadSavedModels(db);
  return options
    ? effectiveState(state, options, await degradedModels(db, now))
    : modelState(state);
}

class CatalogueHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super('openrouter_catalog_error');
    this.status = status;
  }
}

// Bound discovery too: a stalled catalogue must not indefinitely block the rules fallback.
async function getJson(deps: TextLogDeps, url: string): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await (deps.fetch ?? fetch)(url, {
          headers: { Authorization: `Bearer ${deps.env.OPENROUTER_API_KEY}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new CatalogueHttpError(response.status);
        return response.json() as Promise<unknown>;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('openrouter_catalog_timeout'));
        }, 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const quotaRefreshes = new Map<string, { attemptedAt: number; pending: Promise<number | null> }>();

export async function refreshFreeRemaining(deps: TextLogDeps): Promise<number | null> {
  const key = deps.env.DATABASE_URL;
  const now = (deps.now ?? (() => new Date()))().getTime();
  const previous = quotaRefreshes.get(key);
  if (previous && now - previous.attemptedAt < 60_000) return previous.pending;
  const pending = fetchFreeRemaining(deps);
  quotaRefreshes.set(key, { attemptedAt: now, pending });
  return pending;
}

async function fetchFreeRemaining(deps: TextLogDeps): Promise<number | null> {
  if (!deps.env.OPENROUTER_API_KEY) return (await savedModels(deps.db)).freeRemaining;
  try {
    const parsed = z
      .object({
        data: z.object({
          free_model_daily_requests: z.object({ remaining: z.number().int().nonnegative() }),
        }),
      })
      .parse(await getJson(deps, 'https://openrouter.ai/api/v1/key'));
    const freeRemaining = parsed.data.free_model_daily_requests.remaining;
    const freeCheckedAt = (deps.now ?? (() => new Date()))();
    await deps.db
      .insert(textLogModels)
      .values({ id: 1, freeRemaining, freeCheckedAt })
      .onConflictDoUpdate({ target: textLogModels.id, set: { freeRemaining, freeCheckedAt } });
    // All preference variants share the same account quota.
    for (const [key, entry] of cache) {
      if (JSON.parse(key)[0] === deps.env.DATABASE_URL)
        entry.state = { ...entry.state, freeRemaining, freeCheckedAt };
    }
    return freeRemaining;
  } catch {
    return (await savedModels(deps.db)).freeRemaining;
  }
}

export async function getFreeModels(deps: TextLogDeps): Promise<ModelState> {
  if (!deps.env.OPENROUTER_API_KEY)
    return savedModels(deps.db, deps.env, (deps.now ?? (() => new Date()))());
  const key = cacheKey(deps);
  let entry = cache.get(key);
  if (!entry) {
    let pending = loading.get(key);
    if (!pending) {
      pending = loadSavedModels(deps.db).then((state) => {
        const loaded = { state };
        cache.set(key, loaded);
        return loaded;
      });
      loading.set(key, pending);
    }
    try {
      entry = await pending;
    } finally {
      loading.delete(key);
    }
  }
  const now = (deps.now ?? (() => new Date()))();
  if (entry.pending) return entry.pending;
  const degraded = await degradedModels(deps.db, now);
  if (entry.pending) return entry.pending;
  const usable = (state: SavedModelState): ModelState => effectiveState(state, deps.env, degraded);
  const checked = entry.state.freeCheckedAt;
  if (
    entry.state.freeRemaining === 0 &&
    (!checked ||
      checked.toISOString().slice(0, 10) < now.toISOString().slice(0, 10) ||
      now.getTime() - checked.getTime() > 15 * 60_000)
  ) {
    await refreshFreeRemaining(deps);
    if (entry.pending) return entry.pending;
  }
  if (
    (entry.state.checkedAt && now.getTime() - entry.state.checkedAt.getTime() <= 6 * 3_600_000) ||
    (entry.attemptedAt !== undefined && now.getTime() - entry.attemptedAt < 60_000)
  )
    return usable(entry.state);
  entry.attemptedAt = now.getTime();
  const current = entry;
  current.pending = (async () => {
    try {
      let models: FreeModel[] = [];
      for (const parameter of ['structured_outputs', 'response_format']) {
        try {
          const catalog = catalogSchema.parse(
            await getJson(
              deps,
              `https://openrouter.ai/api/v1/models?supported_parameters=${parameter}`,
            ),
          );
          models = catalog.data.flatMap((raw) => {
            const result = modelSchema.safeParse(raw);
            return result.success ? [result.data] : [];
          });
          if (models.length) break;
        } catch (error) {
          if (
            parameter === 'response_format' ||
            !(error instanceof CatalogueHttpError) ||
            ![400, 404, 422].includes(error.status)
          )
            throw error;
        }
      }
      const state = {
        ...current.state,
        // Persist the eligible pool before preferences, denylist, health and cut.
        // This lets later configuration changes reuse a current catalogue.
        candidates: filterAndRankModels(models, {
          TEXT_LOG_MAX_CANDIDATES: String(models.length),
        }),
        checkedAt: now,
      };
      // The existing jsonb column also accepts model records. Keep the schema
      // unchanged and normalize legacy string arrays at the read boundary.
      const persistedCandidates = state.candidates as unknown as string[];
      await deps.db
        .insert(textLogModels)
        .values({ id: 1, candidates: persistedCandidates, checkedAt: now })
        .onConflictDoUpdate({
          target: textLogModels.id,
          set: { candidates: persistedCandidates, checkedAt: now },
        });
      current.state = { ...current.state, candidates: state.candidates, checkedAt: now };
    } catch {
      /* Keep the last filtered list, even when stale. Never log provider data. */
    }
    await refreshFreeRemaining(deps);
    return usable(current.state);
  })();
  try {
    return await current.pending;
  } finally {
    delete current.pending;
  }
}
