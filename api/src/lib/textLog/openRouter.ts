import { aiMealParseJsonSchema, aiMealParseSchema, type AiMealParse } from '@lean/shared';
import {
  getFreeModels,
  refreshFreeRemaining,
  filterAndRankModels,
  type FreeModel,
  type TextLogDeps,
} from './freeModels';
import { recordFailure, recordSuccess, degradedModels } from './health';

export type AiOutcome =
  'invalid_output' | 'timeout' | 'provider_error' | 'rate_limited' | 'non_free_model' | 'no_models';
interface AiMetrics {
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  attempts: number;
}
export type AiResult =
  | ({ ok: true; parse: AiMealParse; model: string } & AiMetrics)
  | ({ ok: false; outcome: AiOutcome; reason?: 'quota' | 'busy' } & AiMetrics);

export async function interpretWithAi(
  deps: TextLogDeps,
  input: { system: string; user: string },
  evaluationModels?: readonly FreeModel[],
): Promise<AiResult> {
  const metrics: AiMetrics = { model: null, promptTokens: 0, completionTokens: 0, attempts: 0 };
  const failure = (outcome: AiOutcome, reason?: 'quota' | 'busy'): AiResult => ({
    ok: false,
    outcome,
    ...metrics,
    ...(reason ? { reason } : {}),
  });
  if (!deps.env.OPENROUTER_API_KEY) return failure('no_models');
  const controller = new AbortController();
  let timedOut = false;
  let rejectTimeout: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  // A race also bounds injected fetch implementations that ignore AbortSignal.
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectTimeout(new Error('timeout'));
  }, 30_000);
  const network: typeof fetch = (url, init) =>
    controller.signal.aborted
      ? Promise.reject(new Error('timeout'))
      : Promise.race([
          (deps.fetch ?? fetch)(url, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([controller.signal, init.signal])
              : controller.signal,
          }),
          deadline,
        ]);
  const boundedDeps = { ...deps, fetch: network };
  let sent: string[] = [];
  const failSent = () =>
    Promise.all(sent.map((id) => recordFailure(deps.db, id, (deps.now ?? (() => new Date()))())));
  try {
    const state = await Promise.race([getFreeModels(boundedDeps), deadline]);
    // Manual evaluation may narrow discovery to live catalogue records. Apply the
    // same free-price, modality, context, denylist and health checks to those records.
    const discovered =
      evaluationModels === undefined
        ? state.candidates
        : filterAndRankModels(
            evaluationModels,
            deps.env,
            await degradedModels(deps.db, (deps.now ?? (() => new Date()))()),
          ).map((model) => model.id);
    if (!discovered.length) return failure('no_models');
    if (state.freeRemaining === 0) return failure('rate_limited', 'quota');
    let candidates = discovered.filter((id) => id.endsWith(':free') && id !== 'openrouter/auto');
    while (candidates.length && metrics.attempts < 2) {
      sent = candidates;
      metrics.model = null;
      metrics.attempts++;
      const response = await network('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deps.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          models: sent,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'meal_parse', strict: true, schema: aiMealParseJsonSchema },
          },
          provider: { require_parameters: true, max_price: { prompt: 0, completion: 0 } },
          temperature: 0,
          max_tokens: 2000,
        }),
      });
      if (response.status === 429) {
        await failSent();
        return failure('rate_limited', 'busy');
      }
      if (!response.ok) {
        await failSent();
        return failure('provider_error');
      }
      let raw: unknown;
      try {
        raw = await Promise.race([response.json(), deadline]);
      } catch {
        if (timedOut) throw new Error('timeout');
        await failSent();
        return failure('invalid_output');
      }
      // Inspect only expected fields; provider data and prompts must never be logged.
      const data = raw as {
        model?: unknown;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        choices?: { finish_reason?: unknown; message?: { content?: unknown } }[];
      } | null;
      const tokens = (n: unknown) =>
        typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
      metrics.promptTokens += tokens(data?.usage?.prompt_tokens);
      metrics.completionTokens += tokens(data?.usage?.completion_tokens);
      metrics.model = typeof data?.model === 'string' ? data.model : null;
      if (!metrics.model || !sent.includes(metrics.model) || !metrics.model.endsWith(':free'))
        return failure('non_free_model');
      const model = metrics.model;
      let parsed: ReturnType<typeof aiMealParseSchema.safeParse> | undefined;
      try {
        const content = data?.choices?.[0]?.message?.content;
        if (data?.choices?.[0]?.finish_reason !== 'length' && typeof content === 'string') {
          parsed = aiMealParseSchema.safeParse(
            JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')),
          );
        }
      } catch {
        /* Invalid JSON follows the same single retry as invalid schema. */
      }
      if (parsed?.success) {
        await recordSuccess(deps.db, model);
        return { ok: true, parse: parsed.data, ...metrics, model };
      }
      await recordFailure(deps.db, model, (deps.now ?? (() => new Date()))());
      candidates = sent.filter((id) => id !== model);
      if (!candidates.length || metrics.attempts === 2) return failure('invalid_output');
    }
    return failure('no_models');
  } catch {
    if (sent.length) await failSent();
    return failure(timedOut ? 'timeout' : 'provider_error');
  } finally {
    // Refresh after any model request, including failures. Share the total deadline.
    if (metrics.attempts) {
      try {
        await Promise.race([refreshFreeRemaining(boundedDeps), deadline]);
      } catch {
        /* Last saved quota remains valid. */
      }
    }
    clearTimeout(timer);
  }
}
