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

### 2026-10-21 · M1-02 · passes

- Fixed the one failing step (6) from the verify-M1 pass: `src/db/schema.ts` now exports `SPOT_V2_COLUMNS` (status + the four v2 JSON column names, typed against `SpotRowV2`), and `src/__tests__/db-migrate.test.ts` uses neutral keys (`feature`, `inRun`, `landing`, `metadata`) mapped through it in one helper (`oldJsonColumns`, shared by `insertOldSpot` and the pure `migrateSpotRowV3` cases). Migrations 1–3 are unchanged, and so is what each test asserts. Tests 366 → 366.
- Verified: the step-6 grep prints nothing (exit 1); `git diff 782ff8d -- src/db/schema.ts` removes only the old `MIGRATIONS` line; db-migrate 28/28, the 8 step suites 109/109 (zero round-trip, null clears, getSpotLegacy ×3, store null → undefined); `check.sh` green (366); `jest --ci` 0 `console.error`.
- Next (M1-04 step 1): its grep still hits the `SpotLegacy` keys in `src/types/index.ts`, a spot-detail test title, and archive-payload JSON in `db-migrate.test.ts` (`custom_type`, `bustability`, `skate_stops` inside the full-fat fixture/expected legacy). `in_run` no longer appears there.
- Questions for Michael: none.
- Proposed changes: the step greps should exclude migration-test fixtures by design, e.g. `| grep -v 'src/db/schema.ts\|db-migrate.test.ts'`, rather than make sessions route old names through schema.ts.

### 2026-10-21 · verify M1

M1-01, M1-03, M1-05 hold. M1-02 step 6 and M1-04 step 1 fail as written: the greps are specified to print nothing but match `SpotLegacy` keys and v2 fixtures in `db-migrate.test.ts`, which migration tests need. The next session should either narrow the step greps or the code; behaviour itself checks out (all tests green). Both set to `passes: false`.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M1-01 | 1 | `grep -n "^#" docs/plans/2026-10-20-m1-model.md`; read Legacy keys, Migration 3, Test file plan | all sections present; 16 legacy keys with empty/is_stopped/status-never-archived rule; two-step section; 5 ALTERs, rebuild, idx_spots_status dropped, idx_spots_deleted_at recreated; 20-row test table | yes |
| M1-01 | 2 | read docs/plans/2026-10-20-m1-model.md lines 194-240 | fixture with curved rail, knobs, setup options, intensity 5, bustability 3, notes hello, status draft; expected feature_types [], stopped true, natural_speed 3, legacy object | yes |
| M1-01 | 3 | `grep -n FEATURE_TYPE_LABELS docs/plans/2026-10-20-m1-model.md` | section says src/constants/labels.ts replaces STOP_TYPE_LABELS; FilterSheet/edit private copies replaced | yes |
| M1-01 | 4 | `npx expo lint`, `npx tsc --noEmit`, `npx jest --ci` | lint clean, tsc ok, 366/366 pass | yes |
| M1-02 | 1 | read src/types/index.ts, factories.ts | NaturalSpeed 0-4, Spot fields, SpotUpdate nulls, factory feature_types [] stopped false (old nested fields already removed by M1-04, superset of step) | yes |
| M1-02 | 2 | `git diff 782ff8d..HEAD -- src/db/schema.ts`; grep LATEST_SCHEMA_VERSION | LATEST = MIGRATIONS.length (3); 158 additions, one changed line (the MIGRATIONS array); migration1/2 untouched | yes |
| M1-02 | 3 | `jest db-migrate.test.ts --verbose`; read FULL_LEGACY and full-fat test | all 28 pass; full-fat asserts feature_types_json [], stopped 1, natural_speed 3, notes hello, legacy toEqual the 16-key object; v1→v3, re-run no-op, fk check, columns/index tests all pass | yes |
| M1-02 | 4 | `jest db-spots.test.ts --verbose`; read SPOT_COLUMNS use | round trip, natural_speed 0, null clears, getSpotLegacy null/object all pass; getSpots omit legacy_json | yes |
| M1-02 | 5 | `jest stores.test.ts` | "null clears notes and natural_speed (undefined in memory)" passes | yes |
| M1-02 | 6 | `grep -rn "feature_json\|in_run_json\|landing_json\|metadata_json" src app --include=*.ts --include=*.tsx | grep -v src/db/schema.ts`; db-init, db-foreign-keys, use-spot-actions, db-settings tests | tests pass, but grep prints ~45 lines, all in src/__tests__/db-migrate.test.ts (v2 fixtures that migration tests need); step says it prints nothing | NO |
| M1-02 | 7 | lint, tsc, `jest --ci`, `grep -c console.error` | all green, 0 console.error | yes |
| M1-03 | 1 | both greps from the step | both print nothing | yes |
| M1-03 | 2 | read src/types/index.ts | SortField 3 members; UserSettings 2 keys; DEFAULT_FILTERS {types:[]}; SpotFilters shape; Requirement/SetupOption gone | yes |
| M1-03 | 3 | read db-settings.test.ts 17-33 | stored blob with gear → toStrictEqual {units metric, radius 30}; save/get round-trips two keys; passes | yes |
| M1-03 | 4 | read stores.test.ts 195-260 | count test sets types, stopped, speed range → 3; empty → 0; stopped true/false filter tests pass; gear tests gone | yes |
| M1-03 | 5 | read spots-sort-search.test.tsx 256; grep Intensity | chips equal [Distance, Date, Name]; no Intensity match | yes |
| M1-03 | 6 | profile.test, filter-sheet.test verbose | "no My Gear section or gear chips" and "no gear, build or drafts filter" pass | yes |
| M1-03 | 7 | review-persist.test; read app/add/review.tsx:132, app/import/review.tsx; grep status | Save text "Save"; tests assert untagged not-stopped no status for Quick Add and import; no status in import screen | yes |
| M1-03 | 8 | spot-list.test, spot-map.test; read SpotMap.tsx:75 | "never shows a status badge", every Marker pinColor SPOT_PIN, description undefined for untagged: pass | yes |
| M1-03 | 9 | lint, tsc, jest --ci | green, 0 console.error | yes |
| M1-04 | 1 | read types/index.ts; the step grep | Spot has exactly the §2.1 fields, 8 FeatureTypes; but grep prints SpotLegacy keys in src/types/index.ts (custom_type, bustability, raw_in_run), a test title in spot-detail.test.tsx and db-migrate.test.ts lines; step says it prints nothing | NO |
| M1-04 | 2 | ls deleted files; read labels.ts, units.ts; grep removed helpers | StarRating/RatingBadge gone, FEATURE_TYPE_LABELS exists, no STOP_TYPE_LABELS; units.ts exports only displayLength; helpers not referenced | yes |
| M1-04 | 3 | spot-name.test.ts verbose | Rail; Rail +1; Stair set +2 (3 types); undefined for []; pass (4 expectations in 3 tests) | yes |
| M1-04 | 4 | stores.test.ts "types is any-of", natural speed range tests | filter [rail] keeps [ledge,rail], drops [bank]; range keeps unrated, 0 real: pass | yes |
| M1-04 | 5 | edit-spot-name, edit-remove-photo tests; ls deleted tests | pass; "Save writes only the name and updated_at"; three tests deleted | yes |
| M1-04 | 6 | spot-detail.test.tsx; read detail index.tsx | notes text found, no Notes label without notes: pass | yes |
| M1-04 | 7 | read FilterSheet, SpotListItem props, (tabs)/index.tsx:106; components.test | eight chips only, no stopped/speed controls; props no difficulty/isDraft; featureType={featureTypesLabel(item)}; no RatingBadge cases | yes |
| M1-04 | 8 | `npx expo export --platform ios --output-dir /tmp/hl-export-verify` | exit 0; lint/tsc/jest green, 0 console.error | yes |
| M1-05 | 1 | ls reviews/m1.diff; read plan "Review (M1-05)" | m1.diff exists (4861 lines; differs from current diff only by later commits); review table has severity, file:line, fix commits, required checks answered | yes |
| M1-05 | 2 | `git log` 95f93b4/b99c7cd, e9a4ad7/719b747; db-migrate tests | RED commits precede GREEN; rollback and raw_feature tests pass; natural_speed 0 tests pass; getSpots uses SPOT_COLUMNS | yes |
| M1-05 | 3 | `git show --stat 4a695a1`; plan Simplifications | own commit "refactor: ..." touching detail index and types; plan states no unused styles / duplicate maps remain (grep found no TYPE_LABELS copies) | yes |
| M1-05 | 4 | grep -i draft/gear/rating/intensity in CLAUDE.md README.md RUNNING-ON-PHONE.md; read lines 30-44 | no hits; v3 model, legacy_json, getSpotLegacy described; no Draft badge / yellow pins | yes |
| M1-05 | 5 | lint, tsc, `jest --ci` | green, 366 pass, 0 console.error | yes |

### 2026-10-21 · M1-05 · passes

- Opus review of `reviews/m1.diff` (4861 lines): 1 Important, 4 Minor, recorded with commits under "Review (M1-05)" in `docs/plans/2026-10-20-m1-model.md`. **Important fixed (RED 95f93b4 → GREEN b99c7cd):** `useDbInit` loaded spots, media and settings in one `try`, so a failed migration 3 left default settings (saving Units would overwrite the stored radius) and a usable-looking app whose writes fail. Each load now has its own `try`, and `DBInitializer` shows "Couldn't upgrade your spots · Nothing was lost · close and reopen to retry" (**D28 *default***, spec §1 + §9 Q8). Minor: store `applySpotUpdate` ignores undefined keys (e9a4ad7 → 719b747); new migration-3 late-failure rollback test; plan `raw_*` key names. Not changed: archiving an unkept old type (spec maps it to `[]`).
- Refactor 4a695a1: detail `headerRow` wrapper gone, `NaturalSpeed` comment. No unused styles or duplicate label maps existed (scripted check). Docs 19ebc62: CLAUDE.md, README Status and RUNNING-ON-PHONE describe the v3 model; no drafts, gear, ratings, Intensity or yellow pins.
- Verified: `check.sh` green, tests 360 → 366, `jest --ci` 0 `console.error`, `expo export --platform ios` exit 0. Check answers: bad JSON → `raw_feature` (test), rollback keeps v2 (test), `natural_speed` 0 round-trips (4 tests), `getSpots` uses `SPOT_COLUMNS` without `legacy_json`.
- Next (M2): keep edit's `SectionHeader`/`FieldLabel`, since the new sections reuse them.
- Question for Michael: D28. When an upgrade fails, should the app block with a "close and reopen" screen (default), or let you in anyway?
- Proposed changes: step 3 assumes there are unused styles and a duplicate `TYPE_LABELS` in edit/index. M1-03/04 had already removed both, so the pass had less to do than the step expects.

### 2026-10-21 · M1-04 · passes

- Nested model gone: `Spot` is spec §2.1 (no `feature/in_run/landing/metadata`); `Material`/`StopType`/`LandingSurface`/`SkateStopInfo`/`Dimensions`/`FeatureDetails`/`InRun`/`Landing`/`SpotMetadata`/`FeatureType.Other` deleted. `StarRating`/`RatingBadge` (+ `ratingColors`, star icon mappings) deleted. `labels.ts` = `FEATURE_TYPE_LABELS` only; `units.ts` = `displayLength` only (`dimensionFromInput`/`initialDimText`/`inputToMeters`/`metersToDisplay` had no caller left; M7 adds its own radius conversion). `featureTypesLabel` replaces `featureLabel` (list row, map callout). Store: types any-of on `feature_types`, speed range on `natural_speed` 0–4 keeps unrated. Edit = photos + Name + Delete, Save writes `{ name, updated_at }`; detail = photos + title + Notes. FilterSheet header "What's here", eight chips. Tests 397 → 360 (deleted edit-dimensions, edit-skate-stops, spot-detail-stops, RatingBadge/StarRating, dimension-helper cases; added featureTypesLabel ×3, any-of, speed range ×3, edit save keys, spot-detail.test.tsx ×3, eight-chip sheet).
- Verified: `check.sh` green (360), `jest --ci` 0 `console.error`, `npx expo export --platform ios` exit 0. Step-1 grep prints only `SpotLegacy` keys in `src/types/index.ts` (`custom_type`, `bustability`, `bustability_notes`, `raw_in_run`) and 22 lines of `db-migrate.test.ts` fixtures, both migration-3 archive data, kept on purpose. Opus review: no high/medium; dead code + stale comment fixed; callout "Rail +1" kept per the M1 plan until M5.
- Next: M2 builds `SpotTagFields`/`SpeedScale` into edit (Save must then add `feature_types`, `stopped`, `natural_speed`, `notes`; the edit-spot-name "only name and updated_at" key test will need widening). The list badge no longer capitalises (labels are cased already).
- Questions for Michael: none.
- Proposed changes: step 1's grep should also exclude `src/__tests__/db-migrate.test.ts` and the `SpotLegacy` interface (its archive keys are the `legacy_json` shape M3 displays), e.g. `| grep -v 'src/db/schema.ts\|db-migrate.test.ts' | grep -v 'src/types/index.ts:.*?: \(string\|number\)'`.

### 2026-10-21 · M1-03 · passes

- Removed gear (`GearItem`/`BuildItem`, `UserSettings.gear`, settings store/actions, Profile "My Gear", FilterSheet gear + exclude build), draft (`SpotStatus`, `Spot.status`, list/detail badge, `DRAFT_PIN`, Show Drafts, edit Status section, "Save as Draft" → "Save"), `SortField.Intensity` (chip + sortKey), `Requirement`/`SetupOption`/`RequirementCategory` (setup options UI on edit and detail; `InRun` keeps only `natural_speed` until M1-04). `SpotFilters` is the final shape and the store has the `stopped` filter; `selectActiveFilterCount` counts types/stopped/speed. `getUserSettings` returns exactly `{ units, batch_import_radius }` (drops a stored `gear`). Tests 412 → 397 (gear/draft/Intensity cases deleted; added stopped filter ×2, count ×2, legacy gear blob, review-persist ×2, one pin colour, empty callout).
- Verified: `check.sh` green (397), `jest --ci` 0 `console.error`; both step-1 greps print nothing (FilterSheet's local `draft` state renamed `pending`, since step 1 also greps `Draft`). Opus review: no bug introduced; cosmetic findings fixed.
- **Next (M1-04) must fix, found by review, pre-existing since M1-02:** `selectFilteredSpots`' type filter still reads `spot.feature.type` and the speed range reads `spot.in_run.natural_speed`, both always empty for DB-loaded spots, so picking a type in the Filter sheet hides every spot on a real DB. The map callout (`featureLabel`) is empty for the same reason. M1-04 steps 3/4 cover it: switch to `feature_types` (any-of) and `spot.natural_speed`, and rewrite the stores "filters by type" test on `feature_types`.
- Edit/detail still show the Intensity/Bustability stars (nested `metadata`, removed in M1-04).
- Questions for Michael: none.
- Proposed changes: step 1's `grep "Draft"` also matches an unrelated `setDraft` (local unsaved-filter state); it was renamed, but the step could grep `\bDraft\b\|SpotStatus` instead.

### 2026-10-21 11:05 · M1-02 · passes

- Migration 3 in `src/db/schema.ts`: adds `feature_types_json`/`stopped`/`natural_speed`/`notes`/`legacy_json`, backfills via the pure exported `migrateSpotRowV3`, rebuilds `spots` without `status` and the 4 JSON columns (`idx_spots_status` gone). `src/db/spots.ts` reads/writes the new columns, uses explicit `SPOT_COLUMNS` (never `legacy_json`), new `getSpotLegacy`. `Spot` gains `feature_types`, `stopped`, `natural_speed?`, `notes?` (old fields kept, read back as empty defaults). `SpotUpdate` takes null for notes/natural_speed and the store clears on null (0 kept). The review screens write `feature_types: []`, `stopped: false`. Tests 387 → 412.
- Verified: `check.sh` green (412), 0 `console.error`; db-migrate 27 cases (full-fat → exact 16-key legacy, rail, empty → NULL, speed 1→0, unparseable, soft-deleted, 1→2→3, idempotent, 4 media + `foreign_key_check` empty, column list/indexes); db-spots round trip incl. `natural_speed 0`, null clears, getSpotLegacy. Opus review: no medium/high bugs; its 3 low findings were fixed (unpicked `{requires:[]}` setup options are not archived, a blank column is not archived as raw, the `use-db-init` comment now says a failed 2→3 leaves the list empty until the next launch retries).
- Builder calls (spec §10, "Older details" key wording): an unparseable column is archived as `raw_feature`/`raw_in_run`/`raw_landing`/`raw_metadata`, not `raw_<column>_json`.
- Next (M1-03): factory still sets `status: Complete` (rowToSpot's interim default); remove both with `SpotStatus`. Review screens already write `feature_types`/`stopped`.
- Questions for Michael: none.
- Proposed changes: M1-02 step 6's grep also prints `src/__tests__/db-migrate.test.ts`, which step 3 needs to insert v2 rows into the old columns. Its `grep -v` should also exclude that file. M1-04's similar grep is fine. Step 2: the diff unavoidably changes the `MIGRATIONS` line itself (1 removed line); everything else is additions.

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
