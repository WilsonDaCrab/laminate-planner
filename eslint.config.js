import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NODE_PATTERN = {
  group: ['node:*', 'fs', 'path', 'os', 'child_process', 'crypto', 'worker_threads'],
  message: 'core must not use Node API.',
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'results/**', 'report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/bench/**/*.ts', '.claude/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Pure core: no DOM, no Node API, no hidden nondeterminism (randomness comes from core/rng,
    // time from a passed-in clock).
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core must not touch the DOM.' },
        { name: 'document', message: 'core must not touch the DOM.' },
        { name: 'process', message: 'core must not use Node API.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use core/rng.' },
        { object: 'Date', property: 'now', message: 'Use the injected clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use the injected clock.',
        },
      ],
      'no-restricted-imports': ['error', { patterns: [NODE_PATTERN] }],
    },
  },
  {
    // The validator must stay independent of the code it checks.
    files: ['packages/core/src/validate/**/*.ts'],
    ignores: ['packages/core/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NODE_PATTERN,
            {
              group: [
                '**/layout',
                '**/layout/**',
                '**/plan',
                '**/plan/**',
                '**/evaluate',
                '**/evaluate/**',
                '**/optimize',
                '**/optimize/**',
              ],
              message: 'core/validate may only import geometry and model.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
