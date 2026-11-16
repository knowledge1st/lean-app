import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/goals/**'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: { lines: 95 },
    },
  },
});
