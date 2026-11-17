import { aiMealParseJsonSchema } from '@lean/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../../db/client';
import { testEnv } from '../../test-env';
import { getFreeModels, refreshFreeRemaining } from './freeModels';
import { recordFailure, recordSuccess } from './health';
import { interpretWithAi } from './openRouter';

vi.mock('./freeModels', () => ({ getFreeModels: vi.fn(), refreshFreeRemaining: vi.fn() }));
vi.mock('./health', () => ({ recordFailure: vi.fn(), recordSuccess: vi.fn() }));
const candidates: [string, string, string] = ['google/a:free', 'qwen/b:free', 'other/c:free'];
const parse = { items: [], otherDayMentioned: false };
const input = { system: 'system prompt', user: 'texto privado' };
function reply(model = candidates[0], content = JSON.stringify(parse), finish_reason = 'stop') {
  return Response.json({
    model,
    choices: [{ message: { content }, finish_reason }],
    usage: { prompt_tokens: 10, completion_tokens: 3 },
  });
}
const deps = (fetch: typeof globalThis.fetch) => ({
  db: {} as Db,
  env: { ...testEnv, OPENROUTER_API_KEY: 'fake' },
  fetch,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFreeModels).mockResolvedValue({
    candidates,
    checkedAt: new Date(),
    freeRemaining: 10,
    freeCheckedAt: null,
  });
  vi.mocked(refreshFreeRemaining).mockResolvedValue(9);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('interpretWithAi', () => {
  it('does no network without key, candidates or account quota', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await interpretWithAi({ ...deps(fetch), env: testEnv }, input)).toMatchObject({
      ok: false,
      outcome: 'no_models',
      attempts: 0,
    });
    expect(getFreeModels).not.toHaveBeenCalled();
    vi.mocked(getFreeModels).mockResolvedValueOnce({
      candidates: [],
      checkedAt: null,
      freeRemaining: null,
      freeCheckedAt: null,
    });
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({ outcome: 'no_models' });
    vi.mocked(getFreeModels).mockResolvedValueOnce({
      candidates,
      checkedAt: null,
      freeRemaining: 0,
      freeCheckedAt: null,
    });
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
      outcome: 'rate_limited',
      reason: 'quota',
      attempts: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only the specified free-model request and accepts fenced JSON', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(reply(candidates[0], '```json\n' + JSON.stringify(parse) + '\n```'));
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
      ok: true,
      parse,
      attempts: 1,
      promptTokens: 10,
      completionTokens: 3,
    });
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({
      Authorization: 'Bearer fake',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      models: candidates,
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
    });
    expect(body.models.every((m: string) => m.endsWith(':free'))).toBe(true);
    expect(body).not.toHaveProperty('user');
    expect(recordSuccess).toHaveBeenCalledWith(expect.anything(), candidates[0]);
    expect(refreshFreeRemaining).toHaveBeenCalledOnce();
  });
  it.each(['paid/a', 'unknown/a:free', undefined])(
    'rejects model outside sent list: %s without retry',
    async (model) => {
      const response = reply(model);
      if (model === undefined) {
        const data = (await response.json()) as { model?: string };
        delete data.model;
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(data));
        expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
          ok: false,
          outcome: 'non_free_model',
          attempts: 1,
        });
        return;
      }
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
      expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
        ok: false,
        outcome: 'non_free_model',
        attempts: 1,
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it.each([true, false])('sends a homogeneous group with reasoning support %s', async (reasoning) => {
    vi.mocked(getFreeModels).mockResolvedValueOnce({
      candidates,
      reasoningSupported: {
        [candidates[0]]: reasoning, [candidates[1]]: !reasoning, [candidates[2]]: reasoning,
      },
      checkedAt: new Date(), freeRemaining: 10, freeCheckedAt: null,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(reply());
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({ ok: true, attempts: 1 });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.models).toEqual([candidates[0], candidates[2]]);
    if (reasoning) expect(body.reasoning).toEqual({ enabled: false });
    else expect(body).not.toHaveProperty('reasoning');
    expect(body.provider).toEqual({ require_parameters: true, max_price: { prompt: 0, completion: 0 } });
  });
  it.each([true, false])('recalculates the group after invalid output with reasoning %s', async (reasoning) => {
    vi.mocked(getFreeModels).mockResolvedValueOnce({
      candidates,
      reasoningSupported: {
        [candidates[0]]: reasoning, [candidates[1]]: !reasoning, [candidates[2]]: reasoning,
      },
      checkedAt: new Date(), freeRemaining: 10, freeCheckedAt: null,
    });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(reply(candidates[0], '', 'length'))
      .mockResolvedValueOnce(reply(candidates[1]));
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({ ok: true, attempts: 2 });
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0].models).toEqual([candidates[0], candidates[2]]);
    expect(bodies[1].models).toEqual([candidates[1]]);
    expect(bodies[0].reasoning).toEqual(reasoning ? { enabled: false } : undefined);
    expect(bodies[1].reasoning).toEqual(reasoning ? undefined : { enabled: false });
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(recordFailure).toHaveBeenCalledWith(expect.anything(), candidates[0], expect.any(Date));
  });
  it.each(['{"items":[{}]}', 'not json'])(
    'retries invalid output once excluding responder: %s',
    async (content) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(reply(candidates[0], content))
        .mockResolvedValueOnce(reply(candidates[1]));
      expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
        ok: true,
        attempts: 2,
        promptTokens: 20,
        completionTokens: 6,
      });
      expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).models).toEqual(
        candidates.slice(1),
      );
      expect(recordFailure).toHaveBeenCalledWith(
        expect.anything(),
        candidates[0],
        expect.any(Date),
      );
    },
  );
  it('counts length as invalid even with valid JSON and stops at two attempts', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(reply(candidates[0], JSON.stringify(parse), 'length'))
      .mockResolvedValueOnce(reply(candidates[1], JSON.stringify(parse), 'length'));
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
      outcome: 'invalid_output',
      attempts: 2,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(recordFailure).toHaveBeenCalledTimes(2);
  });
  it.each([429, 500, 503])(
    'does not retry HTTP %s and records failures for sent candidates',
    async (status) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('', { status }));
      expect(await interpretWithAi(deps(fetch), input)).toMatchObject(
        status === 429
          ? { outcome: 'rate_limited', reason: 'busy', attempts: 1 }
          : { outcome: 'provider_error', attempts: 1 },
      );
      expect(fetch).toHaveBeenCalledOnce();
      expect(recordFailure).toHaveBeenCalledTimes(candidates.length);
    },
  );
  it.each([400, 401, 402, 403, 404, 422])(
    'returns provider_error for HTTP %s without degrading candidates',
    async (status) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(input.user, { status }));
      for (let i = 0; i < 3; i++) {
        expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
          ok: false, outcome: 'provider_error', attempts: 1,
        });
      }
      expect(recordFailure).not.toHaveBeenCalled();
      expect(recordSuccess).not.toHaveBeenCalled();
      if ([401, 402, 403].includes(status)) {
        expect(log).toHaveBeenCalledTimes(3);
        expect(log).toHaveBeenCalledWith('OpenRouter configuration error', { status });
        expect(JSON.stringify(log.mock.calls)).not.toContain(input.user);
        expect(JSON.stringify(log.mock.calls)).not.toContain('fake');
      } else expect(log).not.toHaveBeenCalled();
    },
  );
  it.each(['success', 'invalid', 'http'])(
    'returns timeout after draining a slow %s health write',
    async (kind) => {
      vi.useFakeTimers();
      const slowWrite = () => new Promise<void>((resolve) => setTimeout(resolve, 80_000));
      if (kind === 'success') vi.mocked(recordSuccess).mockImplementationOnce(slowWrite);
      else vi.mocked(recordFailure).mockImplementationOnce(slowWrite);
      const response = kind === 'http'
        ? new Response('', { status: 429 })
        : reply(candidates[0], kind === 'success' ? JSON.stringify(parse) : '{}');
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
      let settled = false;
      const result = interpretWithAi(deps(fetch), input).then((value) => {
        settled = true;
        return value;
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(false);
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(50_000);
      expect(await result).toMatchObject({ ok: false, outcome: 'timeout', attempts: 1 });
      expect(fetch).toHaveBeenCalledOnce();
      expect(recordFailure).toHaveBeenCalledTimes(candidates.length);
    },
  );
  it('includes quota persistence in the total deadline', async () => {
    vi.useFakeTimers();
    vi.mocked(refreshFreeRemaining).mockImplementationOnce(() => new Promise(() => {}));
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(reply());
    const result = interpretWithAi(deps(fetch), input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ ok: false, outcome: 'timeout', attempts: 1 });
  });
  it('includes discovery storage in the total deadline', async () => {
    vi.useFakeTimers();
    vi.mocked(getFreeModels).mockImplementationOnce(() => new Promise(() => {}));
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = interpretWithAi(deps(fetch), input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ ok: false, outcome: 'timeout', attempts: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });
  it('handles network failure without retry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'));
    expect(await interpretWithAi(deps(fetch), input)).toMatchObject({
      outcome: 'provider_error',
      attempts: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(recordFailure).toHaveBeenCalledTimes(candidates.length);
  });
  it('aborts at the total 30 second deadline even if fetch ignores the signal', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    const result = interpretWithAi(deps(fetch), input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ outcome: 'timeout', attempts: 1 });
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it('shares deadline across both attempts', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(reply(candidates[0], '{}')), 20_000)),
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    const result = interpretWithAi(deps(fetch), input);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ outcome: 'timeout', attempts: 2 });
  });
});
