import { afterEach, expect, test, vi } from 'vitest';
import { safeScriptError } from './text-log-diagnostics';
import { createTextLogReport } from './text-log-report';

afterEach(() => vi.restoreAllMocks());

test('diagnostics expose only fixed codes and trusted error names', () => {
  const secret = 'postgres://user:password@host/db bearer-secret';
  const error = new TypeError(secret, { cause: new Error(secret) });
  const safe = safeScriptError(error, 'evaluation_failed');
  expect(JSON.parse(safe.message)).toEqual({ error: 'evaluation_failed', name: 'TypeError' });
  expect(safe.cause).toBeUndefined();
  expect(safe.stack).not.toContain(secret);

  error.name = secret;
  expect(JSON.parse(safeScriptError(error, 'models_failed').message)).toEqual({
    error: 'models_failed',
    name: 'Error',
  });
  expect(
    JSON.parse(safeScriptError(new Error('catalog_unavailable'), 'evaluation_failed').message),
  ).toEqual({ error: 'evaluation_failed', name: 'Error', code: 'catalog_unavailable' });
});

test('summaries aggregate each interpreter including failed phrases and partial runs', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const report = createTextLogReport();
  const phrase = {
    text: 'arroz',
    expected: 2,
    mealsCorrect: 2,
    foodsCorrect: 1,
    milliseconds: 10,
    promptTokens: 4,
    completionTokens: 2,
  };
  report.phrase({ interpreter: 'rules', ...phrase, promptTokens: 0, completionTokens: 0 });
  report.phrase({ interpreter: 'model:free', ...phrase });
  report.phrase({
    interpreter: 'model:free',
    text: 'pollo',
    expected: 1,
    outcome: 'rate_limited',
    milliseconds: 30,
    promptTokens: 0,
    completionTokens: 0,
  });
  // The same finalizer runs when evaluation stops early for exhausted quota.
  report.summary();
  const rows = log.mock.calls.map(([line]) => JSON.parse(line as string));
  expect(rows).toHaveLength(5);
  expect(rows[3]).toMatchObject({
    type: 'summary',
    interpreter: 'rules',
    phrases: 1,
    mealsCorrect: 2,
    foodsCorrect: 1,
    averageTokens: 0,
  });
  expect(rows[4]).toEqual({
    type: 'summary',
    interpreter: 'model:free',
    phrases: 2,
    expected: 3,
    mealsCorrect: 2,
    foodsCorrect: 1,
    averageMilliseconds: 20,
    averagePromptTokens: 2,
    averageCompletionTokens: 1,
    averageTokens: 3,
  });
});
