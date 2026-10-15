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
      // Flat config replaces a rule's options wholesale, so restate eslint-config-expo's options
      // (flat/utils/typescript.js) and add the project's `_` ignore patterns on top.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
          caughtErrors: 'all',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
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
