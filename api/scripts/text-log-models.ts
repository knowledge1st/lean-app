import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import type { Env } from '../src/env';
// Node's TS stripping needs explicit extensions; application imports use Vite's
// extensionless convention. Resolve those imports for this manual Node script.
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
  const envFile = new URL('../.dev.vars', import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.DATABASE_URL) throw new Error('missing_database');
  const env: Env = {
    DATABASE_URL: process.env.DATABASE_URL,
    ALLOWED_ORIGIN: '',
    ...(process.env.OPENROUTER_API_KEY
      ? { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }
      : {}),
    ...(process.env.TEXT_LOG_PREFERRED_MODELS !== undefined
      ? { TEXT_LOG_PREFERRED_MODELS: process.env.TEXT_LOG_PREFERRED_MODELS }
      : {}),
    ...(process.env.TEXT_LOG_MODEL_DENYLIST !== undefined
      ? { TEXT_LOG_MODEL_DENYLIST: process.env.TEXT_LOG_MODEL_DENYLIST }
      : {}),
    ...(process.env.TEXT_LOG_MAX_CANDIDATES !== undefined
      ? { TEXT_LOG_MAX_CANDIDATES: process.env.TEXT_LOG_MAX_CANDIDATES }
      : {}),
  };
  const { getDb } = (await import('../src/db/' + 'client.ts')) as typeof import('../src/db/client');
  const { getFreeModels } = (await import(
    '../src/lib/textLog/' + 'freeModels.ts'
  )) as typeof import('../src/lib/textLog/freeModels');
  const state = await getFreeModels({ db: getDb(env), env });
  console.log(
    JSON.stringify(
      {
        candidates: state.candidates,
        freeRemainingToday: state.freeRemaining,
        checkedAt: state.checkedAt,
      },
      null,
      2,
    ),
  );
}
main().catch(() => {
  console.error('No se pudo consultar el diagnóstico. Revisá la configuración y la conexión.');
  process.exitCode = 1;
});
