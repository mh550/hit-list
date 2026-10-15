// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', 'ios/*', 'android/*'],
  },
  {
    rules: {
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary', 'coerce'] }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // eslint-config-expo registers the @typescript-eslint plugin only for TypeScript files, so a
    // rule from that plugin must be scoped the same way or ESLint rejects it for .js files.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Flat config replaces expo's options for this rule, so keep its ignoreRestSiblings and add
      // the project's `_` escape for unused arguments and catch params.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.*'],
    rules: {
      'import/first': 'off',
    },
  },
]);
