// `npm run test:integration` (S4-06): src/__integration__ against the local Supabase stack, never part of `npx jest`.
// Plain Node (no jest-expo preset, no React Native); Node 24 has fetch and WebSocket. The URL and keys come from
// scripts/supabase-env.mjs. Plan: docs/plans/2026-10-22-s4-accounts.md, "Integration harness".
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__integration__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testTimeout: 30000,
};
