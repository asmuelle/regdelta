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
      // Exclude I/O boundaries that are verified by integration/guarded suites
      // (skipped in the offline unit run), not by offline unit coverage: the DB
      // layer (live-DB integration tests), the live HTTP/Anthropic clients (real
      // network), and barrels. The 80% bar then measures unit-testable logic.
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        'packages/db/src/**',
        'packages/pipeline/src/http.ts',
        'packages/pipeline/src/anthropic/invoker.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
