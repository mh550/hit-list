# Real-SQLite test harness + `user_version` migrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Tonight's runbook (`OVERNIGHT.md`) fixes the execution method: **executing-plans, inline**.

**Goal:** Run the SQL in `src/db/*.ts` against a real SQLite engine in Jest, and give the schema a
versioned migration mechanism so later milestones add migrations instead of editing DDL.

**Architecture:** A test-only adapter wraps Node 24's built-in `node:sqlite` `DatabaseSync(':memory:')`
in the subset of the `expo-sqlite` `SQLiteDatabase` API the app uses, so the production DB modules run
unchanged. `migrateDb` reads `PRAGMA user_version`, runs each pending entry of a `MIGRATIONS` array in
its own transaction, and bumps `user_version` inside that transaction.

**Tech Stack:** Jest 29 + jest-expo 57, `node:sqlite` (Node 24.21), expo-sqlite 57 types, TypeScript 6.

**Spec:** `docs/specs/2026-10-13-overnight-design.md` §2.2 "M3 — Real-SQLite harness"; runbook
`OVERNIGHT.md` §M3.

## Global Constraints

- Node 24.21.0 locally; CI uses Node 22 (`node:sqlite` exists from Node 22.5, unflagged since 22.13/23.4).
- No dependency changes in this milestone (no `npm install`, lockfile untouched).
- Production code keeps importing only `expo-sqlite` types; `node:sqlite` is imported by test code only.
- Keep the existing DB-mocked tests; they must keep passing (116 at start of M3).
- `npm run typecheck` 0, `npm run lint` 0, `npx jest --ci` green, zero `console.error` lines.
- Migration 1 = today's DDL verbatim (`CREATE … IF NOT EXISTS`). Never edit a shipped migration.
- `PRAGMA journal_mode = WAL` stays, outside any transaction (SQLite refuses to change journal mode
  inside one).

## Review Focus

1. **A phone that already has the v0 tables with spots in them** (any earlier dev run) → `migrateDb`
   must adopt them as version 1 with every row intact. (Task 4, "upgrades a v0 DB".)
2. **A migration that throws halfway** → the DB must be left exactly at the previous version, no
   half-created tables, and the next launch retries. (Task 4, "rolls back a failing migration".)
3. **A DB from a newer build** (`user_version` above what this build knows, e.g. after switching
   branches in Expo Go) → the app must still open: no migration re-run, no throw. (Task 4.)
4. **Spot names and notes with quotes, em-dashes and emoji** → round-trip byte-for-byte through
   parameter binding. (Task 2.)
5. **A corrupt `user_settings` JSON blob** → today `getUserSettings` throws, `useDbInit` swallows it
   and the *whole* load is skipped. Expected: settings fall back to defaults. (Task 3.)

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/__tests__/helpers/node-sqlite-db.ts` (new) | `createTestDb()`: `node:sqlite` behind the expo-sqlite methods the app uses |
| `src/__tests__/db-spots.test.ts` (new) | spots CRUD against the real engine |
| `src/__tests__/db-media.test.ts` (new) | media insert / list / delete |
| `src/__tests__/db-settings.test.ts` (new) | settings defaults, round trip, merge, corrupt JSON |
| `src/__tests__/db-migrate.test.ts` (new) | `user_version` mechanism |
| `src/db/schema.ts` | `MIGRATIONS`, `LATEST_SCHEMA_VERSION`, `migrateDb(db, migrations?)` |
| `src/db/settings.ts` | corrupt-JSON fallback |
| `package.json` (`jest.testPathIgnorePatterns`) | stop Jest treating `__tests__/helpers/*` as suites |
| `tsconfig.json` (`compilerOptions.types`) | add `node` so `node:sqlite` typechecks (TS 6 defaults `types` to `[]`) |

---

### Task 1: The harness and the first real round trip

**Files:**
- Create: `src/__tests__/helpers/node-sqlite-db.ts`
- Create: `src/__tests__/db-spots.test.ts`
- Modify: `package.json` (`jest.testPathIgnorePatterns`), `tsconfig.json` (`types`)

**Interfaces:**
- Produces: `createTestDb(): SQLiteDatabase` — supports `execAsync(sql)`, `runAsync(sql, ...params)`
  and `runAsync(sql, paramsArray)` → `{ lastInsertRowId, changes }`, `getFirstAsync<T>` → `T | null`,
  `getAllAsync<T>` → `T[]`, `withTransactionAsync(task)`, `closeAsync()`. Booleans bind as 1/0
  (expo-sqlite does the same). Named-parameter objects throw (no app code uses them).

- [ ] **Step 1: Write the failing test** — `src/__tests__/db-spots.test.ts`

```ts
import { createTestDb } from './helpers/node-sqlite-db';
import { migrateDb, insertSpot, getSpots } from '@/src/db';
import { createTestSpot } from './factories';

describe('spots against real SQLite', () => {
  it('migrateDb → insertSpot → getSpots round-trips a spot', async () => {
    const db = createTestDb();
    await migrateDb(db);
    const spot = createTestSpot({ name: 'Ledge at Pier 57' });

    await insertSpot(db, spot);

    expect(await getSpots(db)).toEqual([spot]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx jest --ci src/__tests__/db-spots.test.ts` →
  "Cannot find module './helpers/node-sqlite-db'".

- [ ] **Step 3: Implement the harness** — `src/__tests__/helpers/node-sqlite-db.ts`

```ts
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase, SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

type Params = SQLiteBindValue[] | [SQLiteBindValue[]];

function toNode(params: Params): SQLInputValue[] {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : (params as SQLiteBindValue[]);
  return flat.map((v) => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) {
      throw new Error('node-sqlite-db: only positional parameters are supported');
    }
    return v as SQLInputValue;
  });
}

/** In-memory SQLite exposing the expo-sqlite methods the app uses (signatures from SQLiteDatabase.d.ts). */
export function createTestDb(): SQLiteDatabase {
  const raw = new DatabaseSync(':memory:');
  const db = {
    async execAsync(source: string): Promise<void> {
      raw.exec(source);
    },
    async runAsync(source: string, ...params: Params): Promise<SQLiteRunResult> {
      const r = raw.prepare(source).run(...toNode(params));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(source: string, ...params: Params): Promise<T | null> {
      return (raw.prepare(source).get(...toNode(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, ...params: Params): Promise<T[]> {
      return raw.prepare(source).all(...toNode(params)) as T[];
    },
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync(): Promise<void> {
      raw.close();
    },
  };
  return db as unknown as SQLiteDatabase;
}
```

  Config, same commit: in `package.json` → `jest.testPathIgnorePatterns` add `"/__tests__/helpers/"`
  (Jest's default `testMatch` treats every file under `__tests__/` as a suite). In `tsconfig.json`
  → `"types": ["jest", "node"]` (TS 6 no longer auto-includes `@types/node`; it was implicitly
  included under TS 5.9, so this restores the pre-upgrade type environment).

- [ ] **Step 4: Run it, expect PASS** — same command; then `npm run typecheck` and `npm run lint` → 0.
- [ ] **Step 5: Commit** — `test: real-SQLite harness over node:sqlite + first spots round trip`.

### Task 2: Spots suite against the real engine

**Files:** Modify `src/__tests__/db-spots.test.ts`. No production change expected; if one of these
fails, that is a real bug in `src/db/spots.ts` — fix it there with this test as the RED.

**Interfaces:** Consumes `createTestDb()` (Task 1); `insertSpot`, `getSpot`, `getSpots`,
`updateSpot`, `softDeleteSpot` from `@/src/db`.

- [ ] **Step 1: Add the tests** (shared `beforeEach`: `db = createTestDb(); await migrateDb(db);`)

```ts
it('lists newest first and excludes soft-deleted spots', async () => {
  const older = createTestSpot({ created_at: '2026-10-13T10:00:00.000Z' });
  const newer = createTestSpot({ created_at: '2026-10-13T12:00:00.000Z' });
  const gone = createTestSpot({ created_at: '2026-10-13T11:00:00.000Z' });
  for (const s of [older, newer, gone]) await insertSpot(db, s);
  await softDeleteSpot(db, gone.id);

  expect((await getSpots(db)).map((s) => s.id)).toEqual([newer.id, older.id]);
});

it('getSpot returns null for a soft-deleted spot', async () => {
  const s = createTestSpot();
  await insertSpot(db, s);
  await softDeleteSpot(db, s.id);
  expect(await getSpot(db, s.id)).toBeNull();
});

it('partial updateSpot leaves the other JSON columns intact', async () => {
  const s = createTestSpot({
    feature: { type: FeatureType.Rail },
    in_run: { natural_speed: 3, setup_options: [] },
    landing: { difficulty: 2 },
    metadata: { notes: 'kinked' },
  });
  await insertSpot(db, s);

  await updateSpot(db, s.id, { name: 'Kinked rail', status: SpotStatus.Complete });

  const got = await getSpot(db, s.id);
  expect(got).toMatchObject({
    name: 'Kinked rail',
    status: SpotStatus.Complete,
    feature: s.feature,
    in_run: s.in_run,
    landing: s.landing,
    metadata: s.metadata,
  });
});

it('round-trips quotes, dashes and emoji in text fields', async () => {
  const name = `O'Brien's "kink" rail — Pier 57 🛹`;
  const s = createTestSpot({ name, metadata: { notes: `it's "fine"; DROP TABLE spots; --` } });
  await insertSpot(db, s);
  expect(await getSpot(db, s.id)).toEqual(s);
});
```

  Before writing, check the exact optional field names in `src/types/index.ts` (`FeatureDetails`,
  `InRun`, `Landing`, `SpotMetadata`) and use real ones; adjust the literals, not the types.

- [ ] **Step 2: Run** `npx jest --ci src/__tests__/db-spots.test.ts` → all PASS (or a real bug → fix in
  `spots.ts`).
- [ ] **Step 3: Commit** — `test: spots CRUD against real SQLite`.

### Task 3: Media + settings suites, corrupt-settings fallback

**Files:** Create `src/__tests__/db-media.test.ts`, `src/__tests__/db-settings.test.ts`; modify
`src/db/settings.ts:21-25`.

**Interfaces:** Consumes `createTestDb()`; `insertMedia`, `getMediaForSpot`, `deleteMedia`,
`getUserSettings`, `saveUserSettings`, `setSetting`.

- [ ] **Step 1: Media tests**

```ts
it('lists a spot’s media oldest first, only that spot’s', async () => {
  const spot = createTestSpot(); const other = createTestSpot();
  await insertSpot(db, spot); await insertSpot(db, other);
  const b = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T12:00:00.000Z' });
  const a = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T11:00:00.000Z',
    location: { latitude: 47.6, longitude: -122.3 }, captured_at: '2026-10-13T10:59:00' });
  await insertMedia(db, b); await insertMedia(db, a);
  await insertMedia(db, createTestMedia({ spot_id: other.id }));

  expect(await getMediaForSpot(db, spot.id)).toEqual([a, b]);
});

it('deleteMedia removes only that row', async () => {
  const spot = createTestSpot(); await insertSpot(db, spot);
  const keep = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T11:00:00.000Z' });
  const drop = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T12:00:00.000Z' });
  await insertMedia(db, keep); await insertMedia(db, drop);
  await deleteMedia(db, drop.id);
  expect(await getMediaForSpot(db, spot.id)).toEqual([keep]);
});
```

- [ ] **Step 2: Settings tests**

```ts
it('returns defaults on an empty DB', async () => {
  expect(await getUserSettings(db)).toEqual(DEFAULT_USER_SETTINGS);
});
it('round-trips saved settings', async () => {
  const s = { units: UnitSystem.Metric, batch_import_radius: 120, gear: [GearItem.Winch] };
  await saveUserSettings(db, s);
  expect(await getUserSettings(db)).toEqual(s);
});
it('fills keys missing from an older saved blob with defaults', async () => {
  await setSetting(db, 'user_settings', JSON.stringify({ units: UnitSystem.Metric }));
  expect(await getUserSettings(db)).toEqual({ ...DEFAULT_USER_SETTINGS, units: UnitSystem.Metric });
});
it('falls back to defaults when the saved blob is not valid JSON', async () => {
  await setSetting(db, 'user_settings', '{not json');
  expect(await getUserSettings(db)).toEqual(DEFAULT_USER_SETTINGS);
});
```

- [ ] **Step 3: Run** both files → the corrupt-JSON test FAILS (`SyntaxError`), the rest PASS.
- [ ] **Step 4: Fix** `getUserSettings`:

```ts
export async function getUserSettings(db: SQLiteDatabase): Promise<UserSettings> {
  const raw = await getSetting(db, 'user_settings');
  if (!raw) return { ...DEFAULT_USER_SETTINGS };
  try {
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) } as UserSettings;
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}
```

- [ ] **Step 5: Run** → PASS. **Commit** — `fix: settings fall back to defaults on corrupt JSON; media + settings suites on real SQLite`.

### Task 4: `user_version` migrations

**Files:** Modify `src/db/schema.ts` (whole file), `src/db/index.ts:1`; create
`src/__tests__/db-migrate.test.ts`.

**Interfaces:**
- Produces: `type Migration = (db: SQLiteDatabase) => Promise<void>`;
  `MIGRATIONS: readonly Migration[]` (index 0 = version 1);
  `LATEST_SCHEMA_VERSION = MIGRATIONS.length`;
  `migrateDb(db, migrations: readonly Migration[] = MIGRATIONS): Promise<void>`;
  `getSchemaVersion(db): Promise<number>`. `SCHEMA_VERSION` is removed (unused anywhere).
- Later milestones append to `MIGRATIONS`; `use-db-init.ts` keeps calling `migrateDb(db)`.

- [ ] **Step 1: Write the failing tests** — `src/__tests__/db-migrate.test.ts`

```ts
const tables = async (db: SQLiteDatabase) =>
  (await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map((r) => r.name);

it('brings a fresh DB to the latest version with all tables', async () => {
  const db = createTestDb();
  await migrateDb(db);
  expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
  expect(await tables(db)).toEqual(['media', 'spots', 'sync_queue', 'user_settings']);
});

it('is a no-op the second time', async () => {
  const db = createTestDb();
  const m1 = jest.fn(async () => {});
  await migrateDb(db, [m1]);
  await migrateDb(db, [m1]);
  expect(m1).toHaveBeenCalledTimes(1);
});

it('upgrades a v0 DB that already has the tables and keeps its rows', async () => {
  const db = createTestDb();
  await MIGRATIONS[0](db);                 // old app: tables exist, user_version still 0
  const spot = createTestSpot({ name: 'kept' });
  await insertSpot(db, spot);
  expect(await getSchemaVersion(db)).toBe(0);

  await migrateDb(db);

  expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
  expect(await getSpots(db)).toEqual([spot]);
});

it('rolls back a failing migration and stays at the previous version', async () => {
  const db = createTestDb();
  const boom: Migration = async (d) => {
    await d.execAsync('CREATE TABLE half_done (x)');
    throw new Error('boom');
  };
  await expect(migrateDb(db, [MIGRATIONS[0], boom])).rejects.toThrow('boom');
  expect(await getSchemaVersion(db)).toBe(1);
  expect(await tables(db)).not.toContain('half_done');
});

it('leaves a DB from a newer build alone', async () => {
  const db = createTestDb();
  await db.execAsync('PRAGMA user_version = 99');
  const m1 = jest.fn(async () => {});
  await expect(migrateDb(db, [m1])).resolves.toBeUndefined();
  expect(m1).not.toHaveBeenCalled();
  expect(await getSchemaVersion(db)).toBe(99);
});
```

- [ ] **Step 2: Run** `npx jest --ci src/__tests__/db-migrate.test.ts` → FAIL (`MIGRATIONS`,
  `getSchemaVersion`, `LATEST_SCHEMA_VERSION` not exported).

- [ ] **Step 3: Implement** — `src/db/schema.ts`: move today's four `CREATE TABLE IF NOT EXISTS`
  statements and the index block verbatim into `migration1(db)`; then

```ts
export type Migration = (db: SQLiteDatabase) => Promise<void>;
export const MIGRATIONS: readonly Migration[] = [migration1];
export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

export async function getSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export async function migrateDb(
  db: SQLiteDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;'); // not allowed inside a transaction
  const current = await getSchemaVersion(db);
  for (let v = current; v < migrations.length; v++) {
    await db.withTransactionAsync(async () => {
      await migrations[v](db);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
```

  `src/db/index.ts:1` → also export `MIGRATIONS`, `LATEST_SCHEMA_VERSION`, `getSchemaVersion` and
  `type Migration`. Check that the mocked `@/src/db` factories in `db-init.test.ts`,
  `use-spot-actions.test.ts` and `profile.test.tsx` still satisfy their imports (they mock
  `migrateDb` only; nothing else imports the new names).

- [ ] **Step 4: Run** the migrate suite → PASS; full `npx jest --ci`, `npm run typecheck`,
  `npm run lint`, `npx expo export --platform ios --output-dir /tmp/hl-export` (then delete it) → all green.
- [ ] **Step 5: Commit** — `feat: user_version migrations (migration 1 = current schema)`.

---

## After the tasks (runbook M3 close-out)

Code review of `git diff <M3 start>..HEAD` by a fresh reviewer, fix Critical/Important with
RED→GREEN, `/simplify`, tick the runbook, Status log, push.
