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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.*'],
    rules: {
      'import/first': 'off',
    },
  },
]);
