/**
 * scripts/supabase-env.mjs (S4-06): runs a command with the local stack's URL and keys in its environment, read from
 * `npx supabase status -o json` at run time so no key is ever written to a file. The script is run for real with a
 * fake `npx` first on PATH (a shell script that prints canned output), so these tests never need Docker.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../scripts/supabase-env.mjs');
const STATUS = {
  API_URL: 'http://127.0.0.1:54321',
  ANON_KEY: 'anon-key-value',
  SERVICE_ROLE_KEY: 'service-role-key-value',
};
/** Prints the three variables the script hands to its command, one per line. */
const PRINT_ENV = [
  'node',
  '-e',
  "for (const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']) console.log(k + '=' + process.env[k])",
];

let bin: string;

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'supabase-env-'));
});

afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
});

/** A fake `npx` that records its arguments in `<bin>/args`, prints `stdout` and exits with `code`. */
function fakeNpx(stdout: string, code: number) {
  writeFileSync(join(bin, 'out'), stdout);
  const path = join(bin, 'npx');
  writeFileSync(path, `#!/bin/sh\necho "$@" > "${bin}/args"\ncat "${bin}/out"\nexit ${code}\n`);
  chmodSync(path, 0o755);
}

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

describe('scripts/supabase-env.mjs', () => {
  it('asks the CLI for the status as JSON', () => {
    fakeNpx(JSON.stringify(STATUS), 0);
    run(PRINT_ENV);
    const args = readFileSync(join(bin, 'args'), 'utf8').trim();
    expect(args).toBe('supabase status -o json');
  });

  it('runs the command with the URL and both keys from the status', () => {
    fakeNpx(JSON.stringify(STATUS), 0);
    const result = run(PRINT_ENV);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      'SUPABASE_URL=http://127.0.0.1:54321',
      'SUPABASE_ANON_KEY=anon-key-value',
      'SUPABASE_SERVICE_ROLE_KEY=service-role-key-value',
    ]);
  });

  it('exits with the code of the command it ran', () => {
    fakeNpx(JSON.stringify(STATUS), 0);
    expect(run(['node', '-e', 'process.exit(3)']).status).toBe(3);
  });

  it('exits 2 and says to start the stack when the status fails', () => {
    fakeNpx('failed to inspect container health', 1);
    const result = run(PRINT_ENV);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Start the stack first: npm run db:start');
    expect(result.stdout).not.toContain('SUPABASE_URL=');
  });

  it('exits 2 when the status is not JSON', () => {
    fakeNpx('Stopped services: [supabase_db_hit-list]', 0);
    const result = run(PRINT_ENV);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Start the stack first: npm run db:start');
  });

  it('exits 2 when the status lacks a key', () => {
    fakeNpx(JSON.stringify({ API_URL: STATUS.API_URL, ANON_KEY: STATUS.ANON_KEY }), 0);
    const result = run(PRINT_ENV);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Start the stack first: npm run db:start');
  });
});

describe('the integration tests are their own run', () => {
  const pkg = require('../../package.json');

  it('npm run test:integration runs them through supabase-env', () => {
    expect(pkg.scripts['test:integration']).toBe(
      'node scripts/supabase-env.mjs jest --config jest.integration.config.js --runInBand',
    );
  });

  it('the default Jest run skips src/__integration__, so npx jest --ci never needs Docker', () => {
    expect(pkg.jest.testPathIgnorePatterns).toContain('/src/__integration__/');
  });

  it('jest.integration.config.js runs only src/__integration__ tests, in node', () => {
    const config = jest.requireActual<Record<string, unknown>>('../../jest.integration.config.js');
    expect(config.testEnvironment).toBe('node');
    expect(config.testMatch).toEqual(['<rootDir>/src/__integration__/**/*.test.ts']);
    expect(config.preset).toBeUndefined();
  });
});
