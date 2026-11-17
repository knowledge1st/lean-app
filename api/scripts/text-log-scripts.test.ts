import { afterEach, expect, test, vi } from 'vitest';
import { safeScriptError } from './text-log-diagnostics';
import { createTextLogReport, describeProposals } from './text-log-report';

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
    ...describeProposals([], []),
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
    ...describeProposals([], [{ meal: 'lunch', food: 'Pollo' }]),
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
  expect(rows[0]).toMatchObject({ proposedCount: 0, proposed: [], missed: [] });
  expect(rows[2]).toMatchObject({
    proposedCount: 0,
    proposed: [],
    missed: [{ meal: 'lunch', food: 'Pollo' }],
  });
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

test('phrase details include proposals and unmatched expected occurrences by food and meal', () => {
  const items = [
    {
      meal: 'lunch',
      mealSource: 'text',
      said: 'arroz',
      food: { name: 'Arroz' },
      match: 'exact',
      grams: 200,
    },
    {
      meal: 'dinner',
      mealSource: 'text',
      said: 'pollo',
      food: { name: 'Pollo' },
      match: 'approximate',
      grams: 150,
    },
    {
      meal: 'lunch',
      mealSource: 'default',
      said: 'desconocido',
      food: null,
      match: 'none',
      grams: 100,
    },
  ] as import('@lean/shared').ProposedItem[];
  const expected = [
    { meal: null, food: 'ninguno' },
    { meal: 'lunch', food: 'Arroz' },
    { meal: 'lunch', food: 'Arroz' },
    { meal: 'lunch', food: 'Pollo' },
  ] satisfies import('../src/lib/textLog/fixtures').TextLogFixture['expected'];
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  createTextLogReport().phrase({
    interpreter: 'rules',
    text: 'arroz, pollo, desconocido',
    expected: expected.length,
    ...describeProposals(items, expected),
    milliseconds: 1,
    promptTokens: 0,
    completionTokens: 0,
  });
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    mealsCorrect: 2,
    foodsCorrect: 3,
    proposedCount: 3,
    proposed: [
      { meal: 'lunch', said: 'arroz', food: 'Arroz', match: 'exact', grams: 200 },
      { meal: 'dinner', said: 'pollo', food: 'Pollo', match: 'approximate', grams: 150 },
      { meal: 'lunch', said: 'desconocido', food: null, match: 'none', grams: 100 },
    ],
    missed: [
      { meal: 'lunch', food: 'Arroz' },
      { meal: 'lunch', food: 'Pollo' },
    ],
  });
});
