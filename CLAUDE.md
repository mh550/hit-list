# CLAUDE.md

## Plan Mode
- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## What this is

**HitList**: a mobile-first app for street snowboarders/skateboarders to track "spots" (one rideable feature at one
place: rail, ledge, bank…). The backend is Supabase (Postgres, Auth, Storage, Edge Functions), **local Docker stack
only, nothing deployed**. Native-only (web is a stub, apart from the static link page in `web/share/`). Runs on
Michael's iPhone in Expo Go (`docs/RUNNING-ON-PHONE.md`).

## Stack

Versions are in `package.json`; the pins that matter: Jest stays 29.7 (with `@types/jest` 29.5.14), and
`react-test-renderer` equals the React version.

## Commands

```bash
npm run start:tailscale        # Metro on the tailnet address → Expo Go on the iPhone
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint (must be 0 errors; no eslint-disable comments)
npx jest --ci                  # all tests (Jest runs with TZ=UTC, see jest.global-setup.js)
npx expo export --platform ios --output-dir /tmp/hl-export   # headless "does it bundle for the phone"
npx expo-doctor                # must be clean
npm run db:stop                # supabase stop: always stop the stack after use
```

## Decisions and plans

- Product spec: `APP_SPECIFICATIONS.md` (its two top sections win over the rest). Design specs: `docs/specs/`.
- Decisions: `docs/decisions.md`, the current rule set. A new default is recorded there as the next free `D<n> *default*`.
- Live steps (cloud Supabase, hosting the link page, TestFlight) are Michael's:
  `docs/plans/2026-10-22-live-checklist.md`.

## Conventions that are easy to get wrong

- **Dependencies only via Expo**: `npx expo install <pkg>` / `npx expo install --fix`, then `npm dedupe` if
  `expo-modules-core` ends up nested (jest-expo needs it at the root; it must not be a direct dependency). Never
  hand-edit `package-lock.json`, never `--force` / `--legacy-peer-deps`. Lockfile changes go in their own `chore:`
  commit.
- **Migrations are append-only**, SQLite `MIGRATIONS` and `supabase/migrations/*.sql` alike: never edit a shipped one.
  Per-connection pragmas (e.g. `foreign_keys`) go next to the WAL line in `migrateDb`, not in a migration.
- **Foreign keys** are off while migrations run and on for the app afterwards, and only on the `SQLiteProvider`
  connection (a second one, e.g. `withExclusiveTransactionAsync`, starts with them off). A table rebuild must drop and
  recreate the migration 5 triggers that name the table, or the RENAME fails.
- **No `withTransactionAsync` for app writes**: it is a plain BEGIN/COMMIT on the shared connection, so two writes at
  once collide. Batch in one statement (`INSERT … FROM json_each(?)`); the few exceptions in `src/sync/` run on
  `runExclusive`. **A `runExclusive` task must never await `syncNow`** (it queues behind itself).
- **Sync (S5)**: every owned write goes through the `src/db/` functions, so the trigger appends its outbox row in the
  same statement; never write `spots`/`media`/`hit_lists`/`hit_list_spots` from a screen or hook, and never write `rev`
  outside `src/sync/` (a pull write changes `rev`, so it queues nothing: no echo loop). Every local membership DELETE
  that isn't the rider's own change sets `rev = -1` first. `owner_id` NULL = phone-only, never synced; new rows take
  `currentOwnerId()`. Server timestamps go through `toIso`. An anon DELETE answers 204 for 0 rows, so push marks a row
  done only while the rider's session lasts. A signed-in rider may have no username yet (`needs_username`).
- **Others' spots are read-only (D47)**: a row is another rider's when `isForeign(row, uid)`; "me" is `riderId()` /
  `useRiderId()` (the signed-in rider, else the phone's account), never the auth `userId` alone. The action hooks
  `assertOwn`; anything that offers, files or sends spots takes `selectMySpots`. Others' photos live only in
  `Paths.cache/photos/<spot>/<media>.jpg` (file_path `cache/…`), never `Paths.document`, and leave with their rows.
- **Spot model (v3)**: `feature_types` (tap order, `[]` = untagged), `stopped`, `natural_speed` (0–4: **0 = None is a
  real value**, undefined = not rated; never test it with `!` or `||`), `notes`. In a `SpotUpdate`, `null` clears.
- **Stores**: `useMemo` the selectors; never build an array inside a `useStore` selector.
- **No location** is stored as `(0, 0)` (`NO_LOCATION`); always test with `isKnownLocation`.
- **Timestamps** are ISO 8601 written by the app.
- **Link tokens live in the fragment (D45)**: a link is `<base>#t=<token>`; the server stores only `token_sha256`; the
  page sends the token only to `share-preview` in a POST body (D96), the app only to `redeem_invite`. Never log a token
  or a link URL (`Linking.openURL`'s rejection holds the URL). A dead link is one 'gone' answer, never which kind.
- **.env**: only `.env.example` (empty values) is committed; real values go in the git-ignored `.env.local`. Never
  commit a key or URL; tests and `scripts/supabase-env.mjs` pass keys through the environment only.
- **Docker**: only containers named `supabase_*_hit-list` belong to this project; never touch `dj-*`, `n8n-*` or any
  other container (both are live projects), and never `docker compose` in another directory.

## Testing

- **TDD**: write the failing test, watch it fail, then the code. Keep `npx jest --ci` green with zero `console.error`
  lines (sync failures log with `console.warn`).
- **DB code runs against real SQLite**: `src/__tests__/helpers/node-sqlite-db.ts` (`createTestDb` /
  `createMigratedTestDb`, Node's `node:sqlite`), not mocks.
- **Fakes mirror the real API**: open the package's `.d.ts` in `node_modules` and copy the member names and signatures
  before mocking (`__mocks__/`, `src/__tests__/helpers/fake-*.ts`, the global mocks in `jest.setup.ts`). The maps
  mock's `mockMapMethods` spies are shared: reset them in `beforeEach` and import them via
  `import * as ReactNativeMaps from 'react-native-maps'`, not `jest.requireMock`.
- Server code: pgTAP in `supabase/tests/` (`npm run test:db`; every RLS policy and function has its cases), using
  the `tests` schema from `seed.sql` (`create_user`, `authenticate_as`, `clear_auth`). Against the real local stack:
  `src/__integration__/` under `jest.integration.config.js` (`npm run test:integration`, never part of `npx jest`).

## Git

Feature work on a branch, never directly on `main`; `main` gets merged branches only. Small, descriptive commits.
Pushing changes to `.github/workflows/*` over HTTPS needs a token with the `workflow` scope
(`gh auth refresh -h github.com -s workflow`); SSH works regardless.

## Where things go

- What happened, what you tried, what failed → your run entry (`entry.json`); outside a run, the PR description.
- A decision → `docs/decisions.md`, the next free `D<n>` (`D<n> *default*` for a default). An overturned one is
  rewritten in place with one `Updated in place <date>: …` line, never a new entry beside a dead one.
- A fact a fresh session would otherwise rediscover → one line in `## Gotchas`, edited in place (verify and retro
  sessions: your entry's `discoveries`, affecting `"run"`).
- A run's scope (what to build or drop) → its brief, never this file. How to work here → Michael's: say it in
  `proposed_changes`.
- Anything the code, git or the suite can tell → nowhere (no test counts, file lists or constants).

## Gotchas

- Commit the RED test (pgTAP: `.test.sql`) before the code; a test written after it needs a mutation run (hit_list-2026-10-20 2026-10-20)
- A new migration edits the `MIGRATIONS` line and breaks version-pinned tests: use `LATEST_SCHEMA_VERSION` (hit_list-2026-10-20 2026-10-21)
- A new route needs its `Stack.Screen` in `app/_layout.tsx` and a `root-layout.test.tsx` case (hit_list-2026-10-20 2026-10-20)
- A new `IconSymbol` name goes in `MAPPING` (`components/ui/icon-symbol.tsx`); tests find `icon-<name>` (hit_list-2026-10-20 2026-10-21)
- Guard an async submit with an in-flight ref: a disabled button still takes two presses in one frame (hit_list-2026-10-20 2026-10-20)
- After an await, check the screen is still mounted before `router.back`/`push`/`replace` (hit_list-2026-10-20 2026-10-21)
- From a stack screen or modal, go to a tab with `router.dismissTo`; `replace` opens a second tab navigator (hit_list-2026-10-22-sharing 2026-10-23)
- iOS ignores `accessibilityLiveRegion`: call `AccessibilityInfo.announceForAccessibility` (hit_list-2026-10-20 2026-10-21)
- An `accessible` parent hides its children from VoiceOver and `getByRole`: make controls siblings (hit_list-2026-10-20 2026-10-21)
- iOS won't present a Modal while another is closing: render the follow-up inside the same Modal (hit_list-2026-10-22-sharing 2026-10-23)
- Jest can't see UIKit gestures, modal presentation or pixels: put those on the phone checklist (hit_list-2026-10-20 2026-10-20)
- The edge runtime doesn't reload an edited function: `docker restart supabase_edge_runtime_hit-list` (hit_list-2026-10-22-sharing 2026-10-23)
