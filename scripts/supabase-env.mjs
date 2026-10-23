#!/usr/bin/env node
// Runs a command with the local Supabase stack's URL and keys in its environment (S4-06, used by
// `npm run test:integration`). They are read from `npx supabase status -o json` at run time and handed to the command
// only, so no key is ever written to a file. Exits 2 when the stack isn't running; otherwise with the command's code.
//
//   node scripts/supabase-env.mjs <command> [args…]
import { spawnSync } from 'node:child_process';

function notRunning() {
  console.error('Start the stack first: npm run db:start');
  process.exit(2);
}

// A hung Docker daemon would hang `status`; after a minute it counts as not running.
const status = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', timeout: 60000 });
if (status.error || status.status !== 0) notRunning();

let parsed;
try {
  parsed = JSON.parse(status.stdout);
} catch {
  notRunning();
}
const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = parsed ?? {};
if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) notRunning();

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/supabase-env.mjs <command> [args…]');
  process.exit(2);
}
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_URL: API_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  },
});
if (result.error) {
  console.error(`Could not run ${command}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
