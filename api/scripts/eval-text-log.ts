import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import type { AiMealParse, ProposedItem } from '@lean/shared';
import type { Env } from '../src/env';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const file = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(file)) return nextResolve(file.href, context);
    }
    return nextResolve(specifier, context);
  },
});

async function main() {
  const args = process.argv.slice(2).filter((arg: string) => arg !== '--');
  if (args.length && (args.length !== 2 || args[0] !== '--model' || !args[1]))
    throw new Error('invalid_arguments');
  // This manual script is never imported by tests or run as part of verification.
  process.loadEnvFile(new URL('../.dev.vars', import.meta.url));
  if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY)
    throw new Error('missing_configuration');
  const env: Env = {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ALLOWED_ORIGIN: '',
    TEXT_LOG_MAX_CANDIDATES: '3',
    TEXT_LOG_PREFERRED_MODELS: process.env.TEXT_LOG_PREFERRED_MODELS ?? '',
    TEXT_LOG_MODEL_DENYLIST: process.env.TEXT_LOG_MODEL_DENYLIST ?? '',
  };
  const { eq } = await import('drizzle-orm');
  const { getDb } = (await import('../src/db/' + 'client.ts')) as typeof import('../src/db/client');
  const { users } = (await import('../src/db/' + 'schema.ts')) as typeof import('../src/db/schema');
  const { buildCatalog } = (await import(
    '../src/lib/textLog/' + 'catalog.ts'
  )) as typeof import('../src/lib/textLog/catalog');
  const { buildPrompt } = (await import(
    '../src/lib/textLog/' + 'prompt.ts'
  )) as typeof import('../src/lib/textLog/prompt');
  const { mapItems } = (await import(
    '../src/lib/textLog/' + 'mapping.ts'
  )) as typeof import('../src/lib/textLog/mapping');
  const { parseWithRules } = (await import(
    '../src/lib/textLog/' + 'rules.ts'
  )) as typeof import('../src/lib/textLog/rules');
  const { interpretWithAi } = (await import(
    '../src/lib/textLog/' + 'openRouter.ts'
  )) as typeof import('../src/lib/textLog/openRouter');
  const { textLogFixtures } = (await import(
    '../src/lib/textLog/' + 'fixtures.ts'
  )) as typeof import('../src/lib/textLog/fixtures');
  const { isFreeModel, filterAndRankModels } = (await import(
    '../src/lib/textLog/' + 'freeModels.ts'
  )) as typeof import('../src/lib/textLog/freeModels');
  const { z } = await import('zod');
  const response = await fetch(
    'https://openrouter.ai/api/v1/models?supported_parameters=structured_outputs',
    {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error('catalog_unavailable');
  const liveModelSchema = z.object({
    id: z.string(),
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
  const live = z
    .object({ data: z.array(z.unknown()) })
    .parse(await response.json())
    .data.flatMap((record) => {
      const parsed = liveModelSchema.safeParse(record);
      return parsed.success ? [parsed.data] : [];
    });
  const fixed = args[1];
  const requested = fixed ? live.find((model) => model.id === fixed) : undefined;
  if (fixed && (!requested || !isFreeModel(requested)))
    throw new Error('model_must_be_live_and_free');
  const models = filterAndRankModels(requested ? [requested] : live, env).slice(0, 3);
  if (!models.length) throw new Error('no_eligible_free_models');
  const db = getDb(env);
  const [testing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, 'testing'));
  if (!testing) throw new Error('missing_testing_user');
  const catalog = await buildCatalog(db, testing.id);
  const prompt = buildPrompt(catalog);
  const report = async (
    label: string,
    fixture: (typeof textLogFixtures)[number],
    parse: AiMealParse,
    elapsed: number,
    promptTokens: number,
    completionTokens: number,
  ) => {
    const items = await mapItems(db, testing.id, parse, catalog, 'lunch');
    const expected = fixture.expected;
    // Count matching occurrences independently of item order, without reusing a prediction.
    const count = (matches: (item: ProposedItem, target: (typeof expected)[number]) => boolean) => {
      const available = [...items];
      return expected.filter((target) => {
        const index = available.findIndex((item) => matches(item, target));
        if (index < 0) return false;
        available.splice(index, 1);
        return true;
      }).length;
    };
    console.log(
      JSON.stringify({
        interpreter: label,
        text: fixture.text,
        mealsCorrect: count((item, target) =>
          target.meal === null
            ? item.mealSource === 'default'
            : item.mealSource === 'text' && item.meal === target.meal,
        ),
        foodsCorrect: count((item, target) => (item.food?.name ?? 'ninguno') === target.food),
        expected: expected.length,
        proposed: items.length,
        milliseconds: Math.round(elapsed),
        promptTokens,
        completionTokens,
      }),
    );
  };
  for (const fixture of textLogFixtures) {
    const start = performance.now();
    const parse = parseWithRules(fixture.text);
    await report('rules', fixture, parse, performance.now() - start, 0, 0);
  }
  for (const model of models) {
    for (const fixture of textLogFixtures) {
      const start = performance.now();
      const result = await interpretWithAi({ db, env, fetch }, { ...prompt, user: fixture.text }, [
        model,
      ]);
      const elapsed = performance.now() - start;
      if (result.ok)
        await report(
          result.model,
          fixture,
          result.parse,
          elapsed,
          result.promptTokens,
          result.completionTokens,
        );
      else {
        console.log(
          JSON.stringify({
            interpreter: model.id,
            text: fixture.text,
            outcome: result.outcome,
            milliseconds: Math.round(elapsed),
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
          }),
        );
        if (result.reason === 'quota') return;
      }
    }
  }
}
main().catch(() => {
  // Driver/provider errors may contain credentials. Only print a fixed diagnostic.
  console.error(
    'No se pudo evaluar. Revisá la base dev, el usuario testing, la configuración y que el modelo sea gratuito en el catálogo en vivo.',
  );
  process.exitCode = 1;
});
