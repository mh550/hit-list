# CLAUDE.md

Guidance for Claude Code working in this repository.

## Plan Mode
- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## What this is

**HitList**: a mobile-first app for street snowboarders/skateboarders to track "spots" (one rideable
feature at one place: rail, ledge, bank…), with photos, a map, and three tags (what's here, skate
stopped, natural speed). Product spec: `APP_SPECIFICATIONS.md`; the simplified model (rev 2) is
`docs/specs/2026-10-16-simplification-design.md`. Native-only (web is a stub). Runs on Michael's iPhone in Expo Go; see
`docs/RUNNING-ON-PHONE.md`.

## Stack (as of 2026-10-15)

Expo **SDK 57** (expo 57.0.30) · React Native 0.86.3 (New Architecture, Hermes) · React 19.2.3 ·
expo-router 57 · zustand 5 · expo-sqlite 57 · expo-file-system 57 (`File`/`Directory`/`Paths`) ·
expo-location 57 · expo-image · react-native-maps 1.27.2 (Apple Maps) · react-native-map-clustering 4 · TypeScript 6.0 strict ·
Jest **29.7** with jest-expo 57 (Jest 30 is not required; keep `@types/jest` 29.5.14) ·
react-test-renderer pinned to 19.2.3 (= React).

## Commands

```bash
npm ci                         # install from the lockfile
npm run start:tailscale        # Metro on the tailnet address → Expo Go on the iPhone
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint (must be 0 errors; no eslint-disable comments)
npx jest --ci                  # all tests (Jest runs with TZ=UTC, see jest.global-setup.js)
npx expo export --platform ios --output-dir /tmp/hl-export   # headless "does it bundle for the phone"
npx expo-doctor                # must be clean
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every branch push.

## Layout

- `app/` expo-router screens: `(tabs)/index.tsx` Spots (List | Map), `(tabs)/profile.tsx`,
  `add/` Quick Add (camera → review), `import/` batch import, `spot/[id]/` detail + edit (one screen: photo grid with
  staged removes and adds, name, tags, notes; nothing is written until Save).
- `src/components/` shared UI, exported from `index.ts`. The M2 edit pieces: `SpeedScale` (five-word natural-speed
  radiogroup, re-tap clears; `readonly` bar form), `PhotoGrid` (hero 4:3 + rows of three square tiles, per-tile badges,
  trailing '+' tile, taps by index), `SpotTagFields` (controlled What's here chips + 'Skate stopped' switch + SpeedScale).
- `src/db/` SQLite access. `schema.ts` holds `MIGRATIONS` (versioned by `PRAGMA user_version`):
  **append a migration, never edit a shipped one**; per-connection pragmas (e.g. `foreign_keys`) go
  next to the WAL line in `migrateDb`, not in a migration. Foreign keys are OFF while migrations run and ON for the app
  afterwards, so a table rebuild is safe; only the `SQLiteProvider` connection has them on (a second connection, e.g.
  `withExclusiveTransactionAsync`, would start with them off).
  `spots.ts`: `getSpots`/`getSpot` select the explicit `SPOT_COLUMNS` (never `legacy_json`); `getSpotLegacy(db, id)` is
  the only reader of the archive.
- `src/stores/` zustand: spots (+ Filter-sheet filters, a separate `searchQuery`, sort, `viewMode`; filtering and sorting live in its selectors), media (`mediaBySpot`), settings, location.
- `src/hooks/` `useDbInit` (migrate, then load spots/media/settings even if the migration threw, background town backfill),
  `useSpotActions`, `useMediaActions` (photo save and remove, also used for adding photos from edit: `savePhotos` resolves the `Media[]` it actually saved; removal deletes the row only, D3), `useCurrentLocation`.
- `src/utils/` pure logic: geo (`NO_LOCATION`, `isKnownLocation`, haversine), exif,
  photo-storage, reverse-geocode, spot-name (D4 label), map-region, import-clustering.

## Conventions that are easy to get wrong

- **Dependencies only via Expo**: `npx expo install <pkg>` / `npx expo install --fix`, then
  `npm dedupe` if `expo-modules-core` ends up nested (jest-expo needs it at the root; it must not be a
  direct dependency). Never hand-edit `package-lock.json`, never `--force` / `--legacy-peer-deps`.
  Lockfile changes go in their own `chore:` commit.
- **Photos**: copied into `Paths.document/photos/<spotId>/<mediaId>.jpg`; `media.file_path` stores
  the **relative** path; resolve with `resolvePhotoUri` at display time. Never write to the camera
  roll; files are not deleted on soft delete.
- **Spot model (v3, migration 3)**: a spot is `feature_types` (ordered `FeatureType[]`, `[]` = untagged,
  column `feature_types_json`), `stopped` (boolean, skate stoppers on it), `natural_speed` (0–4, **0 = None is a
  real value**, undefined = not rated; never test it with `!`), `notes`. In a `SpotUpdate`, `null` clears `name`,
  `notes`, `natural_speed`, `primary_photo_id`. Everything the old nested model held (dimensions, material, stops,
  setup options, old scores…) was archived into
  `legacy_json` (`SpotLegacy` in `src/db/schema.ts`, read via `getSpotLegacy`; v2 test rows in `src/__tests__/fixtures/v2-spots.json`). Feature-type labels come from `FEATURE_TYPE_LABELS`
  (`src/constants/labels.ts`, next to the natural-speed words `SPEED_LABELS`) and `featureTypesLabel` (`src/utils/spot-name.ts`, "Rail +1").
- **No location** is stored as `(0, 0)` (`NO_LOCATION`); always test with `isKnownLocation` (map,
  distance, geocoding).
- **Ids** come from `newId()` in `src/utils/id.ts` (expo-crypto's native `randomUUID`). Never the `uuid`
  package: Hermes has no `crypto.getRandomValues`, so it throws on the phone while Jest (Node) passes. A
  lint rule blocks the import; Jest backs expo-crypto with Node's crypto in `jest.setup.ts`.
- **Timestamps** are ISO 8601 written by the app; migration 2 rewrote the rows SQLite had stamped. An
  imported spot's `created_at` is the import time; the photo's capture time is `media.captured_at`.
- **Unnamed spots** display as `Untitled · <Town> · Oct 13, 2:22 PM` (two lines allowed in the list);
  imported groups start with a blank name so they stay untitled. The town lives in
  `generated_name` (Apple's CLGeocoder via expo-location: a network service, coordinates go to
  Apple; ≤ 10 sequential backfills per launch).
- expo-router 57 has no `@react-navigation/*` dependencies; import from `expo-router` /
  `expo-router/js-tabs`.

## Testing

- **TDD**: write the failing test, watch it fail, then the code. Keep `npx jest --ci` green with zero
  `console.error` lines.
- **DB code runs against real SQLite**: `src/__tests__/helpers/node-sqlite-db.ts`
  (`createTestDb` / `createMigratedTestDb`, Node's built-in `node:sqlite`), not mocks. `node:sqlite` turns foreign keys
  on by default but expo-sqlite does not, so the harness opens with them off and `migrateDb` turns them on, as on the phone.
- **Fakes mirror the real API**: open the package's `.d.ts` in `node_modules` and copy the member
  names and signatures before mocking. Existing fakes: `__mocks__/expo-file-system.ts`
  (+ `helpers/fake-fs.ts` for its test hooks), `__mocks__/react-native-maps.tsx` (its forwardRef
  MapView exposes the shared `mockMapMethods` spies, reset in `beforeEach` with
  `mockMapMethods.fitToCoordinates.mockReset()`; import it via
  `import * as ReactNativeMaps from 'react-native-maps'`, not `jest.requireMock`), and global mocks in
  `jest.setup.ts` (expo-router with overridable `useRouter`/`useLocalSearchParams`, expo-sqlite's `useSQLiteContext`
  defaulting to an empty object so screens that need a db can render; real queries need the node:sqlite harness, expo-location,
  expo-image, FlashList, icons).
- `supercluster` and `kdbush` (ES modules used by react-native-map-clustering) are in Jest's
  `transformIgnorePatterns` so they get transformed.
- Only `*.test.ts(x)` files are tests.

## Git

Feature work on a branch, never directly on `main`; `main` gets merged branches only. Small,
descriptive commits. Pushing changes to `.github/workflows/*` over HTTPS needs a token with the
`workflow` scope (`gh auth refresh -h github.com -s workflow`); SSH works regardless.

## AI skills in the repo

`.agents/skills/` holds React Native / React guidelines (`vercel-react-native-skills`,
`vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`); each has a
`SKILL.md` and an `AGENTS.md`. `.playwright-cli/README.md` documents the browser CLI (only relevant
for web tooling).
