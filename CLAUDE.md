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

Expo **SDK 57** (expo 57.0.31) · React Native 0.86.3 (New Architecture, Hermes) · React 19.2.3 ·
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

- `app/` expo-router screens: tabs Spots · Lists · Profile. `(tabs)/index.tsx` Spots (List | Map via `SpotsBrowser`, a
  `ListPickerChips` row ('My spots' + every hit list) scoping both views, multi-select: long press or 'Select' →
  checkbox rows, '<N> selected', 'Add to list (N)' → `AddToListSheet`; select mode never navigates),
  `(tabs)/lists.tsx` 'My hit lists' (rows with live spot counts, '+ New hit list' → `NameListSheet` → `/list/<id>`),
  `list/[id]/` one list (`SpotsBrowser` scoped to its spots, Rename, long-press 'Remove from list', 'Delete list',
  a 'This list is gone' state), `(tabs)/profile.tsx`,
  `add/` Quick Add (camera → review: photos, name, an 'Add details' link that reveals `SpotTagFields` (one way), an
  'Already have this spot?' card of up to three `nearbySpots` rows with 'Add photos there' (saves to that spot, D30), Save),
  `import/` batch import (review: per group a 'New spot' / 'Add photos to <name>' chip choice when an existing spot is
  within the import radius; photos that failed stay on screen, D31), `spot/[id]/` detail (photo grid or an 'Add photos' tile → edit,
  title, read-only `Tag` line with a red 'Skate stopped', an 'In lists' chip row (+ Add to hit list → `AddToListSheet`), `SpeedScale readonly`, notes, a collapsed 'Older details'
  disclosure) + edit (one screen: photo grid with staged removes and adds, name, tags, notes; nothing is written until Save)
  + `photos.tsx`, the full-screen photo viewer (`fullScreenModal`, `?index=N` from a detail tile; black `FlatList` pager
  of `ZoomablePhoto` pages, 'N / M' counter, ✕ Close, long-press Alert: Set as primary / Remove photo).
  `_layout.tsx` wraps the tree in `GestureHandlerRootView`.
- `src/components/` shared UI, exported from `index.ts`. `ZoomablePhoto` (M4): one viewer page, pinch 1–4×, zoomed pan,
  double tap 1× ↔ 2.5×, swipe down at 1× to close, long press; gesture-handler `Gesture.*` + reanimated shared values
  (`.get()/.set()`, the React Compiler lint rejects `.value =`), every number from `gallery-gestures`; it reports a
  pinch as it starts (`onPinchChange`, the pager stops scrolling) and decodes at full size only while zoomed
  (`allowDownscaling={!zoomed}`). The M2 edit pieces: `SpeedScale` (five-word natural-speed
  radiogroup, re-tap clears; `readonly` bar form), `PhotoGrid` (hero 4:3 + rows of three square tiles, per-tile badges,
  trailing '+' tile (`AddPhotosTile`, shared by detail and edit), taps by index), `SpotTagFields` (controlled What's here chips + 'Skate stopped' switch + SpeedScale).
  Hit lists (S1): `SpotsBrowser` (the List | Map body with search, sort, filter, FAB; takes the `spots` to show plus
  `aboveList`, `headerActions`, `headerTitle`/`headerLeft`, `onSpotPress`/`onSpotLongPress`, `selectedIds`),
  `NameListSheet` (create/rename a list), `AddToListSheet` (a checkbox per manual list, checked when every given spot
  is in it, '+ New hit list'), `ListPickerChips` (store-connected, `null` with no lists).
- `src/db/` SQLite access. `schema.ts` holds `MIGRATIONS` (versioned by `PRAGMA user_version`):
  **append a migration, never edit a shipped one**; per-connection pragmas (e.g. `foreign_keys`) go
  next to the WAL line in `migrateDb`, not in a migration. Foreign keys are OFF while migrations run and ON for the app
  afterwards, so a table rebuild is safe; only the `SQLiteProvider` connection has them on (a second connection, e.g.
  `withExclusiveTransactionAsync`, would start with them off).
  `hit-lists.ts` (migration 4): `insertHitList`, `getHitLists` (live only), `updateHitList`, `softDeleteHitList`,
  `addSpotsToList` (`INSERT OR IGNORE`, idempotent), `removeSpotFromList`, `getListMemberships` (`{ spotId: listId[] }`, live lists).
  `spots.ts`: `getSpots`/`getSpot` select the explicit `SPOT_COLUMNS` (never `legacy_json`); `getSpotLegacy(db, id)` is
  the only reader of the archive (rejects on unreadable JSON, `null` for JSON that is not an object); detail's `OlderDetails` calls it once on mount (effect
  keyed on `[db, spotId]`, not on store updates), `.catch` → `console.warn`, and hides the disclosure when it has no rows.
- `src/stores/` zustand: spots (+ the Filter sheet's three filters: What's here `types` (any of), Skate stopped
  `stopped` (undefined = Any, true, false), Natural speed `natural_speed_min`/`_max` (inclusive range, unrated spots kept;
  `selectActiveFilterCount` counts each set filter once, 0–3), a separate `searchQuery`, sort, `viewMode`; filtering and sorting live in its selectors), media (`mediaBySpot`), settings, location,
  hit lists (`lists`, `membershipBySpot`, `activeListId` = the picker, not persisted; pure selectors `selectListSpots`,
  `selectSpotLists`, `selectListCounts`, `selectListsByName`, all skipping soft-deleted spots; `useMemo` them, never
  build an array inside `useStore`). The filters, search, sort and List | Map are one set shared by the Spots tab and
  every list screen (D52).
- `src/hooks/` `useDbInit` (migrate, then load spots/media/hit lists + memberships/settings even if the migration threw, background town backfill),
  `useSpotActions`, `useHitListActions` (create/rename/delete a list, add/remove spots: store first, then the DB, revert + rethrow on failure), `useMediaActions` (photo save and remove, also used for adding photos from edit: `savePhotos` resolves the `Media[]` it actually saved; removal deletes the row only, D3), `useCurrentLocation`.
- `src/utils/` pure logic: geo (`NO_LOCATION`, `isKnownLocation`, haversine), exif,
  photo-storage, reverse-geocode, spot-name (D4 label), map-region, import-clustering, nearby-spots (`nearbySpots`:
  live known-location spots within a radius, nearest first; `nearbyLabel` 'Near <name> · 16 ft'), gallery-gestures (the viewer's
  pure maths: `clampScale`, `toggleZoom`, `clampPan`, `pagingEnabled`, `shouldClose`, `focalZoom`, `pinchPan`, `doubleTapZoom`,
  `dragDown`), legacy-details (`formatLegacyDetails(legacy, units)` →
  labelled 'Older details' rows: fixed key order, lengths in the user's units, unknown keys humanised, never throws).

## Conventions that are easy to get wrong

- **Dependencies only via Expo**: `npx expo install <pkg>` / `npx expo install --fix`, then
  `npm dedupe` if `expo-modules-core` ends up nested (jest-expo needs it at the root; it must not be a
  direct dependency). Never hand-edit `package-lock.json`, never `--force` / `--legacy-peer-deps`.
  Lockfile changes go in their own `chore:` commit.
- **Photos**: copied into `Paths.document/photos/<spotId>/<mediaId>.jpg`; `media.file_path` stores
  the **relative** path; resolve with `resolvePhotoUri` at display time. Never write to the camera
  roll; files are not deleted on soft delete.
- **Spot model (v3, migration 3)**: a spot is `feature_types` (`FeatureType[]` in tap order, `[]` = untagged,
  column `feature_types_json`), `stopped` (boolean, skate stoppers on it), `natural_speed` (0–4, **0 = None is a
  real value**, undefined = not rated; never test it with `!`), `notes`. In a `SpotUpdate`, `null` clears `name`,
  `notes`, `natural_speed`, `primary_photo_id`. Everything the old nested model held (dimensions, material, stops,
  setup options, old scores…) was archived into
  `legacy_json` (`SpotLegacy` in `src/db/schema.ts`, read via `getSpotLegacy`; v2 test rows in `src/__tests__/fixtures/v2-spots.json`). Feature-type labels come from `FEATURE_TYPE_LABELS`
  (`src/constants/labels.ts`, next to the natural-speed words `SPEED_LABELS`) and `featureTypesLabel` (`src/utils/spot-name.ts`, "Rail +1").
- **Hit lists (S1, migration 4)**: `hit_lists` + `hit_list_spots` are many-to-many (a spot can be in any number of
  lists). Deleting a list is a soft delete (`deleted_at`; its `hit_list_spots` rows stay) and **never deletes a spot**;
  soft-deleting a spot leaves its memberships and the selectors hide it. The area columns (`kind`, `area_center_*`,
  `area_radius_m`, `area_filters_json`, `area_place`) and `owner_id`/`added_by`/`shared` are reserved for S2 and later:
  S1 writes `kind = 'manual'` and NULLs. Lists show in name order (`selectListsByName`). Plan:
  `docs/plans/2026-10-22-s1-hit-lists.md`; spec `docs/specs/2026-10-22-accounts-and-sharing.md`.
- **Import radius** (`batch_import_radius`) is stored in whole **metres**; convert only at the edges with `units.ts`
  (`radiusToDisplay` / `radiusFromInput` / `radiusUnitLabel`: 50 m shows as 164 ft); grouping and `nearbySpots` take metres.
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
- Gestures: `jest.setup.ts` loads `react-native-gesture-handler/jestSetup`, mocks `react-native-worklets` with its own
  `src/mock` (reanimated 4's mock needs it) and wraps reanimated's mock `useSharedValue` in `useState` so a shared value
  survives re-renders like the real hook. Drive gestures with `fireGestureHandler`/`getByGestureTestId` from
  `react-native-gesture-handler/jest-utils` (pages expose `viewer-<i>-pinch|pan|double-tap|long-press`).
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
