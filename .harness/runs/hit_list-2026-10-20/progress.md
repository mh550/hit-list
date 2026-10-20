# Progress log — run `hit_list-2026-10-20`

What this is: the running record of this harness run, **newest entry first**. Every session appends
an entry at the top when it finishes (what it built, what it found, what the next session must know).
The work itself is listed in `feature_list.json` next to this file: the harness gives each fresh
session the first feature whose `passes` is false and whose `after` dependencies pass; array order is
priority. A session changes only its own feature's `passes`. Michael steers the run from the GitHub
app by editing `INBOX.md` on this branch (first line `status: pause` or `status: stop`; answers under
`## Answers`); the harness pulls before every session and every session reads it at startup.

Brief for this run (Michael, 2026-10-20 12:54): build the simplification design rev 2
(`docs/specs/2026-10-16-simplification-design.md`), proceed on the bold defaults in its §9, and
**add anything new to §9 rather than stopping**. Build-only: nothing live, nothing on the phone.

### 2026-10-20 · M1-01 · passes

- Wrote `docs/plans/2026-10-20-m1-model.md`: final types (Spot, SpotUpdate, SpotLegacy, SpotFilters, UserSettings, NaturalSpeed), migration 3 SQL (5 ADD COLUMN, JS backfill via pure `migrateSpotRowV3`, rebuild with explicit column list, `idx_spots_deleted_at` recreated), the 16 legacy keys, the M1-02/03/04 type split, `FEATURE_TYPE_LABELS`, the exact v2 fixture (full/empty/rail) with expected values, and a per-file table for all 20 tests (+ db-migrate, review-persist, screens, spot-name). Docs only; tests 387 → 387.
- Verified: `check.sh` green (387 tests); every required section and all 20 file rows grepped present.
- Next session (M1-02): existing db-migrate v0/v1 cases call `insertSpot` before migrating; switch them to raw old-column inserts. `db-foreign-keys` `rebuildSpots` DDL must match the v3 column order in the plan. In the interim `rowToSpot` returns `status: Complete` and the factory uses Complete, so round trips stay `toEqual`.
- Builder calls (reversible, in the plan): `removable: false` is not archived (edit wrote it by default); unparseable JSON column goes to `legacy.raw_<column>` instead of aborting the migration (a throw would leave the phone at v2 with a v3 mapper, so no spots would load).
- Questions for Michael: none new.
- Proposed change: M1-01 step 3 says edit has a "private TYPE_LABELS copy"; it actually labels chips inline with `t.replace(/_/g, ' ')`. The plan covers both.

---

## 2026-10-20 · Initializer

### Feature counts

| Milestone | What | Features | Depends on |
|---|---|---|---|
| M1 | Model: types, migration 3, mappers, removals of gear / draft / nested model | 5 | — |
| M2 | Edit screen: SpeedScale, PhotoGrid, SpotTagFields, add photos from edit | 7 | M1 |
| M3 | Detail screen: grid, tag line, speed bar, notes, Older details | 4 | M2 |
| M4 | Full-screen photo viewer (pager, pinch/pan/double-tap, long-press) | 7 | M3 |
| M5 | Filter sheet (three filters, speed range), list row, map callout | 5 | M2 |
| M6 | Quick Add "Add details", nearby-spot offer on both review screens | 6 | M2 |
| M7 | Import radius in the user's unit | 2 | M1 |
| M8 | Sweep to zero references, docs, final review and hand-off | 3 | M1–M7 |

39 features. First three: `M1-01` (plan), `M1-02` (migration 3 + mappers), `M1-03` (gear, draft,
Intensity removed). M5, M6 and M7 do not wait on M3/M4, so a stuck viewer does not stop the filters.

Each milestone is merged into `main` on its own when it passes. **M1 alone leaves the app able to
save spots with a location, photos, name and notes but with no way to edit tags** (the edit screen
is stripped to photos + name + delete; tag controls arrive with M2 right after). Nothing is lost:
migration 3 archives every removed field in `legacy_json`.

### How to work a feature

1. Read `CLAUDE.md` (binding), the spec, this file's newest entries, `INBOX.md`, the milestone's
   plan file `docs/plans/2026-10-20-<milestone>.md` (written by the milestone's first feature).
2. TDD: write the failing test, run it (`npx jest --ci <file>`), watch it fail, then the code.
   The feature's `steps` are the acceptance list; a verifier re-runs each one literally.
3. Gates before the commit: `npx expo lint && npx tsc --noEmit && npx jest --silent` (the harness
   suite, same as CI). Zero `console.error` lines in the Jest output. Lint must be 0 errors with no
   `eslint-disable` comments.
4. Small commits with descriptive messages (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:` for
   lockfile changes, which go in their own commit). Never commit on `main`.
5. Append your entry at the top of this file: feature id, what changed, counts, anything the next
   session must know, and any decision Michael should see (also add it to spec §9 per the brief).
6. Set your feature's `passes` to true only when every step holds.

"What Michael will see" (`check` features): this is a native app and the sandbox has no device or
simulator, so the check is a **text-tree walkthrough**: render the screen with
`@testing-library/react-native` in a temporary test file, capture `screen.toJSON()` / the
accessibility labels, write what is on the screen top to bottom into
`docs/plans/2026-10-20-<ms>-what-michael-will-see.md`, delete the temporary test before committing,
and run `npx expo export --platform ios --output-dir /tmp/hl-export` as the "does it bundle for the
phone" check. Real gestures (M4) cannot run here; the walkthrough lists what Michael must try.

Review features: write the milestone diff to `.harness/runs/hit_list-2026-10-20/reviews/<ms>.diff`
(`git diff <first commit of the milestone>^..HEAD -- src app`; the run started at `782ff8d`), have
the reviewer read the file, record findings with severity in the plan file, fix Critical/Important
RED→GREEN, then a `refactor:` simplification commit, then the docs the milestone touched.

### Where things live (read this before touching code)

- **Types** `src/types/index.ts` (213 lines today). Everything removed by the spec is still here:
  `SpotStatus`, `Material`, `StopType`, `GearItem`, `BuildItem`, `LandingSurface`, `Requirement`,
  `SetupOption`, `SkateStopInfo`, `Dimensions`, `FeatureDetails`, `InRun`, `Landing`,
  `SpotMetadata`, `SortField.Intensity`, `UserSettings.gear`, the big `SpotFilters`. Target shape:
  spec §2.1 and §2.5.
- **Schema** `src/db/schema.ts`: `MIGRATIONS = [migration1, migration2]`, `migrateDb` runs each
  pending step in its own transaction with the `user_version` bump; foreign keys OFF during
  migrations, ON after (so a table rebuild does not cascade-delete media). **Append `migration3`;
  never edit 1 or 2.** The migration receives the db and may do the per-row backfill in JS.
- **Mappers** `src/db/spots.ts`: `SpotRow` + `rowToSpot`, `insertSpot`, `getSpot`, `getSpots`
  (`SELECT *` today; must become an explicit column list so `legacy_json` is never loaded),
  `updateSpot` (patch builder; `name`/`primary_photo_id` accept `null`), `softDeleteSpot`.
  `src/db/index.ts` re-exports; `src/db/settings.ts` merges the JSON blob over
  `DEFAULT_USER_SETTINGS` (an old `gear` key must be dropped on read, not just ignored).
- **Stores** `src/stores/spots-store.ts`: `applySpotUpdate` (null → undefined mapping),
  `selectFilteredSpots` (status, search, type, speed, bustability, intensity, gear two-stage),
  `selectSortedSpots`, `selectEffectiveSort`, `selectActiveFilterCount`. `settings-store.ts` has
  `setGear/addGear/removeGear`; `use-settings-actions.ts` has `toggleGear`.
- **Screens**: `app/spot/[id]/edit.tsx` (720 lines, five sections, `handleSave` builds the whole
  nested model, staged photo removal with Undo and `savingRef` double-tap guard: keep those two
  patterns), `app/spot/[id]/index.tsx` (369 lines, `Section`/`InfoRow`/`SetupOptionCard`),
  `app/(tabs)/index.tsx` (list + map, passes `featureLabel`, `difficulty`, `isDraft` to
  `SpotListItem`), `app/(tabs)/profile.tsx` (Units, My Gear, Import Radius with "meters" strings),
  `app/add/review.tsx` ("Save as Draft"), `app/import/review.tsx` (groups → spots, `status: Draft`),
  `app/import/index.tsx` ("(within {batchRadius}m)", `expo-image-picker` already used here with
  `importPhotoFromAsset`: copy that pattern for adding photos from edit).
- **Components** `src/components/`: `Chip`/`ChipGroup` (role checkbox or button, flexWrap group),
  `SegmentedControl` (tablist of string values; reuse for Any / Not stopped / Stopped),
  `FilterSheet` (local draft state, Apply/Reset; has `TYPE_LABELS`, `GEAR_LABELS`, `BUILD_LABELS`),
  `SortChips` (`SORT_OPTIONS` with Intensity), `SpotListItem` (memo), `SpotMap` (`DRAFT_PIN`,
  `SPOT_PIN`, Marker `description`), `StarRating`, `RatingBadge` (both to delete),
  `src/constants/labels.ts` (`STOP_TYPE_LABELS` only; becomes `FEATURE_TYPE_LABELS`),
  `src/constants/theme.ts` (`palette.blue[500]`, `palette.red[500]`, `spacing.xs = 4`, `radius`).
- **Utils** `src/utils/`: `spot-name.ts` (`getSpotDisplayName`, `featureLabel` → becomes
  `featureTypesLabel`), `spot-photos.ts` (`primaryPhoto`, `spotPhotos` order: primary first),
  `units.ts` (dimension helpers; only `displayLength` and the new radius helpers survive),
  `geo.ts` (`NO_LOCATION`, `isKnownLocation`, `haversineDistance` in km, `distanceMeters`,
  `formatDistance(km, imperial)` → "16 ft" / "0.3 mi" / "5 m" / "1.2 km", `metersToFeet`,
  `feetToMeters`), `exif.ts` (`importPhotoFromAsset(asset, nowIso)` → `ImportPhoto` with uri,
  location, capturedAt), `photo-storage.ts` (`persistPhoto`, `resolvePhotoUri`), `id.ts` (`newId`).
- **Hooks**: `use-media-actions.ts` (`savePhotos(NewPhoto[])` copies then inserts, DB-first;
  `removePhotos(ids)` resolves the ids actually removed), `use-spot-actions.ts` (`addSpot` store
  first then DB then background town geocode; `updateSpot`; `removeSpot`), `use-db-init.ts`.
- **Root layout** `app/_layout.tsx`: `Stack` with every screen registered (add `spot/[id]/photos`
  there); imports `react-native-reanimated` already; **no `GestureHandlerRootView` yet**.

### Test harness facts

- 387 tests / 38 suites green at the start (`npx jest --silent`, 22 s). Jest runs with `TZ=UTC`.
- DB tests use real SQLite: `src/__tests__/helpers/node-sqlite-db.ts` (`createTestDb`,
  `createMigratedTestDb`). Foreign keys start OFF there, as on the phone; `migrateDb` turns them on.
  For migration tests, build a v2 DB by running `migrateDb(db, MIGRATIONS.slice(0, 2))`, insert rows
  with the old columns, then `migrateDb(db)`.
- `src/__tests__/factories.ts`: `createTestSpot` / `createTestMedia` / `CITIES`. Every spot test
  goes through it, so changing it once updates most fixtures.
- `jest.setup.ts` already mocks expo-router (`useRouter`, `useLocalSearchParams` are `jest.fn` you
  override with `jest.mocked(...)`), expo-sqlite's `useSQLiteContext` (returns `{}`; screens that
  save must mock `@/src/hooks/use-spot-actions` / `use-media-actions` or `@/src/db`), expo-image
  (renders RN `Image`), FlashList (renders every row), expo-location, expo-crypto, icons, and
  **react-native-reanimated via `react-native-reanimated/mock`**. Not yet:
  `react-native-gesture-handler/jestSetup` (M4-01 adds it) and `expo-image-picker` (M2-05 mocks it
  per file; copy names from `node_modules/expo-image-picker/build/ImagePicker.d.ts`).
- `Alert.alert` in tests: `jest.spyOn(Alert, 'alert').mockImplementation(() => {})` and read the
  buttons from `mock.calls` (see `edit-remove-photo.test.tsx`).
- `react-native-maps` mock: `__mocks__/react-native-maps.tsx`; import it as
  `import * as ReactNativeMaps from 'react-native-maps'`; reset `mockMapMethods` in `beforeEach`.
- Only `*.test.ts(x)` are tests. Zero `console.error` in the run is a gate.
- The 20 test files that reference removed fields (count of hits): stores 73, spots-sort-search 28,
  db-spots 17, spot-map 13, edit-skate-stops 11, components 10, edit-dimensions 9, profile 8,
  filter-sheet 7, factories 6, db-init 5, spots-view-mode 5, spot-detail-stops 3, spot-list 3,
  spots-import-action 3, db-settings 2, use-spot-actions 2, use-current-location 2,
  camera-permission 1, db-foreign-keys 1. Rewrite or delete with the feature, never skip.

### Gotchas

- Ids from `newId()` only; the `uuid` package throws on Hermes (lint blocks it).
- `natural_speed` 0 means "None" and is a real value. Every `?? undefined`, `|| undefined` and
  truthiness check on it is a bug; test the zero round trip at each layer (mapper, store, edit save).
- Photos: never delete files, never write the camera roll; `media.file_path` is relative.
- `NO_LOCATION` is `(0, 0)`; always `isKnownLocation` before distance or geocoding.
- Dependencies only via `npx expo install`; the lockfile change is its own `chore:` commit. The
  only dependency the spec allows adding is `react-native-zoom-toolkit`, and only if the ~150-line
  rule in §3.1 is hit (say so in the plan file and here).
- `npx expo export` and `npx expo-doctor` need the network for some checks; if the sandbox blocks
  them, paste the output and say which checks failed for that reason.
- Build-only policy: nothing runs on the phone in this run. The M8-03 hand-off writes the phone
  steps for Michael (install, first launch migrates his DB, what to try per milestone, no DB rollback
  after migration 3).

### Questions for Michael (defaults taken; answer in `INBOX.md` under `## Answers`)

Spec §9 defaults, all taken as written: Q1 notes kept; Q2 speed words None · Little · Some ·
Enough · Too much; Q3 nearby-spot offer built, never auto-merge; Q4 old fields archived into
`legacy_json` with "Older details"; Q5 Quick Add tags collapsed under "Add details". D15 and D16
stay open and untouched.

New in this run (simplest reversible default chosen):

1. **M1 merges before M2.** For the hours between the two merges, `main` has an edit screen without
   tag controls. Default: accept (the run is overnight and M2 follows directly). Say "hold M1" to
   have the harness merge nothing before M2 passes.
2. **Speed range control (§2.5).** Default: tap low then high; a single segment tapped twice means
   exactly that value; a third tap clears. Say otherwise if you want two separate rows.
3. **Viewer long-press menu** uses `Alert.alert` buttons (no action-sheet dependency). Default: keep.
4. **"Add photos there" on Quick Add** lands on that spot's detail screen (not the list). Default:
   keep; say "back to the list" to change.
5. **Nearby offer on import** shows a per-group choice "New spot / Add photos to <name>" with "New
   spot" preselected. Default: keep.
6. **Older details rows** use spec units at read time (lengths shown in the current unit setting,
   ratings as "3/5"). Default: keep.
