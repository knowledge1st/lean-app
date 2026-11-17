import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../../db/client';
import { testEnv } from '../../test-env';
import { getFreeModels, refreshFreeRemaining } from './freeModels';
import { interpretWithAi } from './openRouter';

vi.mock('./freeModels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./freeModels')>()),
  getFreeModels: vi.fn(),
  refreshFreeRemaining: vi.fn(),
}));
vi.mock('./health', () => ({
  degradedModels: vi.fn().mockResolvedValue([]),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFreeModels).mockResolvedValue({
    candidates: ['other/model:free'],
    checkedAt: new Date(),
    freeRemaining: 10,
    freeCheckedAt: null,
  });
  vi.mocked(refreshFreeRemaining).mockResolvedValue(9);
});
describe('manual evaluation model selection', () => {
  const model = {
    id: 'evaluation/model:free',
    pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    context_length: 32000,
  };
  it.each([
    { ...model, id: 'paid/model' },
    { ...model, pricing: { prompt: '0.1', completion: '0' } },
  ])('rejects non-free catalogue records', async (candidate) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = await interpretWithAi(
      { db: {} as Db, env: { ...testEnv, OPENROUTER_API_KEY: 'fake' }, fetch },
      { system: 'system', user: 'arroz' },
      [candidate],
    );
    expect(result).toMatchObject({ ok: false, outcome: 'no_models', attempts: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('limits a model evaluation to the checked live model', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json({
          model: model.id,
          choices: [
            {
              finish_reason: 'stop',
              message: { content: '{"items":[],"otherDayMentioned":false}' },
            },
          ],
        }),
      );
    const result = await interpretWithAi(
      { db: {} as Db, env: { ...testEnv, OPENROUTER_API_KEY: 'fake' }, fetch },
      { system: 'system', user: 'arroz' },
      [model],
    );
    expect(result.ok).toBe(true);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).models).toEqual([model.id]);
  });
});
