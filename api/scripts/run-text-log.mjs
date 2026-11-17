import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const [script, ...args] = process.argv.slice(2).filter((arg) => arg !== '--');
if (
  !['eval-text-log', 'text-log-models'].includes(script) ||
  (args.length &&
    (script !== 'eval-text-log' || args.length !== 2 || args[0] !== '--model' || !args[1]))
) {
  console.error(
    JSON.stringify({ error: 'invalid_arguments', name: 'Error', code: 'invalid_arguments' }),
  );
  process.exitCode = 1;
} else {
  const envFile = new URL('../.dev.vars', import.meta.url);
  if (process.env.DATABASE_URL === undefined && existsSync(envFile)) process.loadEnvFile(envFile);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('vitest.mjs', import.meta.resolve('vitest/package.json'))),
      'run',
      '--config',
      'vitest.eval.config.ts',
      '--silent=false',
      '--reporter=verbose',
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env,
        TEXT_LOG_SCRIPT: script,
        ...(args[1] ? { EVAL_MODEL: args[1] } : {}),
      },
      stdio: 'inherit',
    },
  );
  if (result.error) console.error(JSON.stringify({ error: 'runner_failed', name: 'Error' }));
  process.exitCode = result.status ?? 1;
}
