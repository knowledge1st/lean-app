import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// These .ts files are outside Vitest's normal *.test / *.spec discovery and CI.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: [
      process.env.TEXT_LOG_SCRIPT === 'text-log-models'
        ? 'scripts/text-log-models.ts'
        : 'scripts/eval-text-log.ts',
    ],
    testTimeout: 30 * 60_000,
    retry: 0,
  },
});
