interface PhraseResult {
  interpreter: string;
  text: string;
  expected: number;
  mealsCorrect?: number;
  foodsCorrect?: number;
  proposed?: number;
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
