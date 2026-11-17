import type { ProposedItem } from '@lean/shared';
import type { TextLogFixture } from '../src/lib/textLog/fixtures';

export function describeProposals(items: ProposedItem[], expected: TextLogFixture['expected']) {
  const mealMatches = (item: ProposedItem, target: (typeof expected)[number]) =>
    target.meal === null
      ? item.mealSource === 'default'
      : item.mealSource === 'text' && item.meal === target.meal;
  const foodMatches = (item: ProposedItem, target: (typeof expected)[number]) =>
    (item.food?.name ?? 'ninguno') === target.food;
  // Match occurrences independently of order, using each prediction once per metric.
  const unmatched = (
    matches: (item: ProposedItem, target: (typeof expected)[number]) => boolean,
  ) => {
    const available = [...items];
    return expected.filter((target) => {
      const index = available.findIndex((item) => matches(item, target));
      if (index < 0) return true;
      available.splice(index, 1);
      return false;
    });
  };
  return {
    mealsCorrect: expected.length - unmatched(mealMatches).length,
    foodsCorrect: expected.length - unmatched(foodMatches).length,
    proposedCount: items.length,
    proposed: items.map((item) => ({
      meal: item.meal,
      said: item.said,
      food: item.food?.name ?? null,
      match: item.match,
      grams: item.grams,
    })),
    missed: unmatched((item, target) => mealMatches(item, target) && foodMatches(item, target)),
  };
}

interface PhraseResult {
  interpreter: string;
  text: string;
  expected: number;
  mealsCorrect?: number;
  foodsCorrect?: number;
  proposedCount: number;
  proposed: ReturnType<typeof describeProposals>['proposed'];
  missed: TextLogFixture['expected'];
  outcome?: string;
  milliseconds: number;
  promptTokens: number;
  completionTokens: number;
}

export function createTextLogReport() {
  const totals = new Map<
    string,
    {
      phrases: number;
      expected: number;
      mealsCorrect: number;
      foodsCorrect: number;
      milliseconds: number;
      promptTokens: number;
      completionTokens: number;
    }
  >();

  return {
    phrase(result: PhraseResult) {
      console.log(JSON.stringify(result));
      const total = totals.get(result.interpreter) ?? {
        phrases: 0,
        expected: 0,
        mealsCorrect: 0,
        foodsCorrect: 0,
        milliseconds: 0,
        promptTokens: 0,
        completionTokens: 0,
      };
      total.phrases++;
      total.expected += result.expected;
      total.mealsCorrect += result.mealsCorrect ?? 0;
      total.foodsCorrect += result.foodsCorrect ?? 0;
      total.milliseconds += result.milliseconds;
      total.promptTokens += result.promptTokens;
      total.completionTokens += result.completionTokens;
      totals.set(result.interpreter, total);
    },
    summary() {
      for (const [interpreter, total] of totals) {
        console.log(
          JSON.stringify({
            type: 'summary',
            interpreter,
            phrases: total.phrases,
            expected: total.expected,
            mealsCorrect: total.mealsCorrect,
            foodsCorrect: total.foodsCorrect,
            averageMilliseconds: total.milliseconds / total.phrases,
            averagePromptTokens: total.promptTokens / total.phrases,
            averageCompletionTokens: total.completionTokens / total.phrases,
            averageTokens: (total.promptTokens + total.completionTokens) / total.phrases,
          }),
        );
      }
    },
  };
}
