// Flat ESLint config for the whole workspace (lint runs from the repo root).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/db/drizzle/**',
      'apps/web/next-env.d.ts',
      'pgdata/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    // Config files run in Node and may use console for diagnostics.
    files: ['**/*.config.{js,ts,mjs}', '**/playwright.config.ts'],
    rules: { 'no-console': 'off' },
  },
);
