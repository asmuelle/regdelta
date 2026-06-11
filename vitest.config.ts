import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@regdelta/core': pkg('./packages/core/src/index.ts'),
      '@regdelta/pipeline': pkg('./packages/pipeline/src/index.ts'),
      '@regdelta/db': pkg('./packages/db/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.ts'],
    },
  },
});
