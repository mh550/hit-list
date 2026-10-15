# HitList — overnight design (2026-10-13), rev 2

Written by a planning session on the Pop!_OS desktop on the evening of 2026-10-13 for an
unattended `/loop` session that follows `OVERNIGHT.md`. Michael reads both from his phone.
Michael answered every §0 question on the morning of 2026-10-14; the overnight session builds on
those answers and does not re-open them.

---

## 0. Decisions (Michael answered 2026-10-14 morning; all settled)

| # | Decision | What the overnight session builds | Michael's answer |
|---|----------|-----------------------------------|------------------|
| D1 | **Expo SDK upgrade 54 → 57** | First milestone (M1), time-boxed to 2 h, one SDK hop at a time (55, 56, 57). If a hop is not green (typecheck + tests + `expo export`) at the box: reset to the last green hop, push the attempt as `overnight/<date>-sdk-attempt`, continue the other milestones on the green SDK. Reason: Expo Go runs only the newest SDK. | **Expo Go on the iPhone is SDK 57.** Target confirmed. |
| D2 | **Map provider** | `react-native-maps` (Apple Maps on iOS, bundled in Expo Go, no key, no dev build). Mapbox only matters for offline tiles and needs a dev build; it can replace the same `SpotMap` component later. | "You decide" → Apple Maps now. |
| D3 | **Photo storage** | Copy every captured/imported photo into the app's document directory (`photos/<spotId>/<mediaId>.jpg`), store the *relative* path in `media.file_path`, resolve at display time. Camera-roll originals untouched; nothing written to the camera roll; files not deleted on soft delete. | Default no (camera roll untouched). |
| D4 | **Unnamed spots** | **Keep the untitled fallback until Michael names the spot**, but make the placeholder informative: `Untitled · <Town> · Oct 13, 2:22 PM` when the town is known, else `Untitled · Oct 13, 2:22 PM`. The town comes from `expo-location` `reverseGeocodeAsync` (on-device Apple geocoder, city/locality only) stored in the existing `generated_name` column; ≤ 10 backfills per launch, silent on failure. The town also seeds the later "group by city" idea (D10). | "Keep untitled fallback until named; maybe placeholder with date/time/town." |
| D5 | **CI triggers** | `.github/workflows/ci.yml` runs on pushes to every branch (today: only `main` and PRs), so the overnight branch shows a check in the GitHub app. | "You decide" → yes. |
| D6 | **Delivery path** | Tonight: Expo Go over the tailnet (`npm run start:tailscale` → scan QR). Michael **has an Apple developer account**, so the next step after this run is an EAS dev build + TestFlight (Michael runs `eas login`; the overnight session never does). That dev build is also when Mapbox becomes possible. | "Yes, Apple dev account for a test build and TestFlight later." |
| D7 | **Branch policy** | `overnight/<date>` from `spec/2026-10-13` (= `main` + this spec + `OVERNIGHT.md`), with the laptop commit `bf3c36e` cherry-picked on first. The review conversation merges `overnight/<date>` into `main`. *In plain words:* `wip/laptop-2026-10-13` is the branch the laptop pushed with its unfinished change (one line: a WSL start script). That change gets copied into the overnight branch, so after the merge the wip branch holds nothing new and can be deleted on GitHub. Harmless either way; default: delete after merge. | "Don't know what you mean" → explained; default stands. |
| D8 | **Multiple spots per location / pin clustering** | Pins only in M5. **Clustering is the first stretch item (S1)**: `react-native-map-clustering` (pure JS wrapper over `react-native-maps`, works in Expo Go). Several spots at one physical location are separate spots (spec data model) that overlap as pins; clustering is what makes that readable when zoomed out. | "Locations will have multiple spots; clustering makes sense; priority unknown." → S1. |
| D9 | **expo-doctor patch bumps** | Ride with the SDK hops (`npx expo install --fix` per hop). | — |
| D10 | **Sort + search** | Stretch S2 (after clustering): sort control (distance first, since the map already shows distance) and search by name. Michael's further ideas — routes between spots, smart folders / tags by city or feature type — go to §6 roadmap, not built tonight. The town stored by D4 is the first ingredient of "by city". | "Both matter; map shows distance; routes later; auto-grouping by city or type would help." |
| D4 note | **Geocoder is not on-device** | Correction found in the M6 review: `reverseGeocodeAsync` uses Apple's CLGeocoder, a network service. The spot's coordinates are sent to Apple and it needs internet (offline lookups fail silently and are retried next launch).  | **Keep it:** \"geocoder as the first line, untitled as a backup\" (2026-10-15). |
| D11 | **Web target** | Stays a stub. Native-only. | — |
| D12 | **Where "Import Photos" lives** | Found during M7: the batch import flow had no entry point in the UI at all. A first default put it on the Profile tab; Michael rejected that. Built: a second action on the Spots tab beside the + button, visible in List and Map views. | "Should not live in the profile tab — bad UX. Spots tab or somewhere else." (2026-10-15) |
| D13 *default* | **Imported spots' date** | Found in the final review: an imported spot's `created_at` is the photo's EXIF capture time (D4 shows that time), and the list sorts by date added, newest first, so importing old photos lands those spots at the bottom. Default: keep capture time. **Question for Michael: keep the capture time, or sort imports by when they were imported?** | *open* |

---

## 1. Current state (evaluated 2026-10-13 ~23:30 EDT)

### 1.1 What the repo is

- `mh550/hit-list`, public. Expo SDK 54 / React Native 0.81.5 / React 19.1 / expo-router 6 /
  zustand 5 / expo-sqlite 16. TypeScript strict. Jest 29 with `jest-expo`.
- 10 commits on `main`, all 2026-02-12 → 2026-02-14 ("Sprint 1–4" plus Metro/web fixes).
  Nothing since, until tonight's one-line WIP commit on the laptop.
- `origin/wip/laptop-2026-10-13` = `main` + one commit (`bf3c36e`, 2026-10-13 02:22) that adds a
  `start:wsl` npm script (packager hostname from `netsh.exe`). It is harmless and desktop-irrelevant,
  so **start from `main` (via `spec/2026-10-13`) and cherry-pick it** (D7); there is nothing
  else on that branch.
- No open issues, no PRs. CI on `main` is **red on both runs ever made** (lint step; see 1.3).
- `CLAUDE.md` is stale: says "specification-phase project — no source code has been written yet",
  references two spec files that do not exist (`spot_finder_app_spec*.md`; the real one is
  `APP_SPECIFICATIONS.md`), and says "commit directly to main".
- `README.md` is the untouched Expo template.
- Project memory (`~/.claude/projects/-home-mh550-projects-hit-list/memory/MEMORY.md`): keep
  `jest@^29` and `@types/jest@29.5.14` **for SDK 54**. The SDK upgrade (D1) re-decides this per hop;
  `jest-expo@57` may require Jest 30 — follow what `npx expo install --fix` installs and update the
  memory note at wrap-up.

### 1.2 What is implemented (and works in tests)

| Area | Where | State |
|------|-------|-------|
| Data model + enums | `src/types/index.ts` | matches `APP_SPECIFICATIONS.md` (flat spot = one feature, setup options, gear/build) |
| SQLite schema v1 + CRUD | `src/db/*.ts` | spots, media, user_settings (JSON blob), sync_queue (unused). **No migration mechanism** (`SCHEMA_VERSION = 1` constant, unused). `PRAGMA foreign_keys` never enabled, so `ON DELETE CASCADE` on media is inert (soft delete is used anyway). |
| Stores | `src/stores/*` | spots (filters, sort, selectors), settings, location |
| Filtering | `src/stores/spots-store.ts` + `src/utils/filtering.ts` | two-stage gear/build filter as specified — **implemented twice** (`selectFilteredSpots` and `filterSpots`); the screen uses the store one |
| Screens | `app/**` | Spots list (FlashList, FAB, filter button) · Profile/settings · Quick Add (camera → review) · Import (picker → cluster → review) · Spot detail · Spot edit (all fields except skate stops, location, photos) · FilterSheet |
| Tests | `src/__tests__/*` | 115 tests, 10 suites, all **mock** the DB (`expo-sqlite` and `@/src/db` are jest-mocked everywhere); the SQL in `src/db` has never run in a test |
| Web | `metro.config.js`, `src/stubs/` | sqlite stubbed to no-op on web; native-only by design |

### 1.3 What a contributor sees today (recorded, not fixed)

| Check | Command | Result |
|-------|---------|--------|
| Install | `npm ci` (Node 24.21.0, npm 11.19.0) | OK (1 install-script warning, audit noise) |
| Typecheck | `npm run typecheck` | **PASS** |
| Lint | `npm run lint` (`expo lint`) | **FAIL** — `A configuration object specifies rule "@typescript-eslint/no-unused-vars", but could not find plugin "@typescript-eslint"` (`eslint.config.js:13`; `eslint-config-expo/flat` registers the plugin under another name). This is why CI is red. |
| Tests | `npx jest --ci` | **PASS** 115/115 in 6.7 s. One `act(...)` warning from `src/hooks/use-db-init.ts:24` in `db-init.test.ts`. |
| Native bundle | `npx expo export --platform ios` | **PASS** — 4.0 MB Hermes bundle |
| Doctor | `npx expo-doctor` | 1 check failed: 9 packages a patch behind (`expo 54.0.33 → ~54.0.37`, `expo-router`, `expo-file-system`, `jest-expo`, …) |
| Real SQLite in Jest | probe (deleted after) | **works**: Node 24 ships `node:sqlite`; a 4-method adapter (`execAsync/runAsync/getAllAsync/getFirstAsync` over `DatabaseSync`) ran `migrateDb → insertSpot → getSpots` round-trip inside `jest-expo` in 4 ms |
| Latest Expo on npm | `npm view expo dist-tags` | `latest = 57.0.28`, `next = 58.0.9`; SDK 55 shipped 2026-02-25, 56 2026-05-20, 57 2026-06-30, 58 2026-09-29 (`next`) |

**End of night (2026-10-15 00:51, branch `overnight/2026-10-14` @ `4172570`):**

| Check | Command | Result |
|-------|---------|--------|
| Install | `npm ci` (Node 24.21.0) | OK, 1116 packages |
| Typecheck | `npm run typecheck` | **PASS** (TypeScript 6.0.3) |
| Lint | `npm run lint` | **PASS**, 0 problems, no `eslint-disable` left |
| Tests | `npx jest --ci` | **PASS** 220/220, 25 suites, 0 `console.error`, ~2.3 s; DB suites on real SQLite (`node:sqlite`) |
| Native bundle | `npx expo export --platform ios` | **PASS** — 4.0 MB Hermes bundle (incl. react-native-maps) |
| Doctor | `npx expo-doctor` | **21/21** |
| CI | GitHub Actions on every branch push | **green** — https://github.com/mh550/hit-list/actions/runs/38683543737 |
| Metro over the tailnet | `npm run start:tailscale`, manifest + launch bundle at `100.88.90.97:8081` | manifest 200 (SDK 57.0.0), bundle 200 (9.3 MB JS); QR URL `exp://100.88.90.97:8081` |
| SDK | `expo` / `react-native` / `react` | 57.0.29 / 0.86.3 / 19.2.3 (Expo Go on the iPhone is SDK 57) |

Bugs 1–5 below are fixed (photos display and persist; EXIF dates ISO; GPS refs applied; location on the
Spots tab). Not verifiable headlessly: the first real run in Expo Go (see `docs/RUNNING-ON-PHONE.md`,
"First things to check").

### 1.4 Bugs found by reading (each becomes a RED test first)

1. **Photos never display.** `app/spot/[id]/index.tsx:101` uses `spot.primary_photo_id` (a UUID) as
   an image URI. `app/(tabs)/index.tsx:52` never passes `thumbnailUri`. `getMediaForSpot` is
   exported from `src/db` and used nowhere. Media rows are written, never read.
2. **Photos vanish.** `app/add/camera.tsx:42` stores the `takePictureAsync` cache URI; the import
   flow stores the image-picker cache URI. Both directories are purgeable by iOS. Nothing copies the
   file into app storage.
3. **EXIF date is not ISO.** `app/import/index.tsx:37` stores `exif.DateTime` verbatim; EXIF
   format is `YYYY:MM:DD HH:MM:SS`, so `new Date(...)` is `Invalid Date` → spots imported from
   photos sort wrongly and display "Untitled Spot — Invalid Date" (`app/import/review.tsx:77`).
4. **GPS hemisphere ignored.** `app/import/index.tsx:32-33` reads `GPSLatitude/GPSLongitude` and
   ignores `GPSLatitudeRef/GPSLongitudeRef`. On iOS the values can come unsigned with the `Ref`
   carrying the sign; a Seattle photo (`W`) would land at +122°. Fix is defensive: apply the ref
   sign when the ref is present and the value is positive.
5. **Distance is almost always blank.** `useLocationStore.currentLocation` is only set inside the
   camera screen (`app/add/camera.tsx:23`); the Spots list and (future) map never request location.
6. Minor: `use-db-init.ts:24` state update outside `act` in tests; `updateSpot` in
   `src/db/spots.ts` ignores the caller's `updated_at` and uses `datetime('now')` (UTC, no `Z`,
   unlike the ISO strings everywhere else).

### 1.5 Gaps versus `APP_SPECIFICATIONS.md` (ordered by what Michael would notice)

- No **map view** at all (spec: Map/List toggle is the primary navigation).
- No **generated_name** (reverse geocode) → every quick-added spot is "Untitled Spot — <date>".
- No **sort** control and no **search** input (store supports both).
- No photo **gallery** on detail, no photo add/remove in edit, no skate-stop fields in edit,
  no location edit (pin drag).
- No cloud: Supabase, auth, sync queue consumer, sharing, crews, folders, video, offline tiles —
  all later phases, all out of scope tonight.

### 1.6 Getting it onto the phone (why D1 is first)

Michael's phone is an iPhone (`iphone-15` on the tailnet; the desktop is `100.88.90.97`). With no
Mac and no Apple developer login on this box, **Expo Go is the only way to run the app on it**, and
Expo Go runs exactly one SDK: the newest stable (57 today). The repo is on 54. So the night starts
with the upgrade, and the headless stand-in for "it runs on the phone" is `npx expo export
--platform ios` plus Metro serving the iOS bundle over the Tailscale address.

---

## 2. The chunk of work: "from compiles to on-the-phone"

**Goal in one sentence:** by morning, Michael opens Expo Go on the iPhone, scans the QR from
`npm run start:tailscale`, and uses HitList with photos that persist and show, spots on a map,
sensible names, and a green check on the branch.

**Why this chunk:** the four sprints built every screen but the loop was never closed on a device.
The remaining blockers are an SDK hop, two photo bugs, one missing screen and one missing name
source. Each is verifiable headlessly (tests, typecheck, `expo export`, Metro bundle request).

### 2.1 Milestones and budget (≈8 h total; stretch only after)

| M | Title | Budget | Headless verification |
|---|-------|--------|-----------------------|
| M0 | Preflight, branch, baseline, status page | 20 min | `git log`, 115 tests, typecheck |
| M1 | SDK upgrade 54 → 55 → 56 → 57 (D1, time-boxed 2 h) | 2 h | per hop: `expo-doctor` clean, typecheck, jest green, `expo export --platform ios` |
| M2 | Green CI: lint config, act() warning, CI on all branches (D5) | 30 min | `npm run lint` exit 0, jest with no console.error, pushed branch gets a CI run |
| M3 | Real-SQLite test harness + schema migrations (`user_version`) | 45 min | new `db-*.test.ts` suites pass against `node:sqlite`, migration runs twice idempotently |
| M4 | Photos persist and display (D3) + media store | 1 h 30 | tests for `photo-storage`, media store, list thumbnail, detail gallery; export OK |
| M5 | Map view with pins + Map/List toggle (D2) | 1 h 15 | render tests with a `react-native-maps` manual mock; export OK |
| M6 | Untitled placeholder with town + time (D4), EXIF date, GPS ref, location on list | 1 h | unit tests for parsers/geocoder wrapper; screen tests |
| M7 | Phone handoff: `start:tailscale`, `docs/RUNNING-ON-PHONE.md`, CLAUDE.md, README, Metro smoke | 30 min | Metro answers `GET /index.bundle?platform=ios` with JS over `100.88.90.97:8081` |
| S | Stretch, in order: S1 pin clustering (D8), S2 sort + search (D10), skate-stop fields in edit, photo remove in edit, `PRAGMA foreign_keys` | — | tests |

If M1 is abandoned at the time box, M2–M7 proceed on SDK 54 unchanged; only the "opens in Expo Go"
claim is lost, and it is recorded as the first item under Needs Michael.

### 2.2 Design notes per milestone (enough to write each plan)

**M1 — SDK upgrade.** Per hop `N ∈ {55, 56, 57}`: `npx expo install expo@^N` then
`npx expo install --fix`, read the hop's upgrade notes from the changelog Expo prints, run
`npx expo-doctor`, `npm run typecheck`, `npx jest --ci`, `npx expo export --platform ios`. Commit
per green hop as `chore: expo sdk N`. Known hazards: `jest-expo` may move to Jest 30 (follow it;
update `@types/jest` to match, then update the project memory note); React / React Native major
bumps may change `react-test-renderer` requirements; `react-native-reanimated`/`worklets` must be
the pair Expo installs; `app.json` `experiments.reactCompiler` may need toggling; `metro.config.js`
`resolveRequest` signature is stable. Do not hand-edit `package-lock.json`. Never `--force` npm.

**M2 — Lint.** Open `node_modules/eslint-config-expo/flat/utils/typescript.js` (or wherever the
installed version registers the TypeScript plugin) and either (a) rename the rule in
`eslint.config.js` to the plugin key the config registers, or (b) `import tseslint from
'typescript-eslint'` and register `plugins: { '@typescript-eslint': tseslint.plugin }` in the same
config object as the rule. (b) is preferred: the rule name in the file stays what everyone expects.
Then fix whatever lint reports (expect unused imports). For the `act()` warning wrap the
`waitFor` in `db-init.test.ts` properly or `await act(async () => …)`. CI: `on.push.branches:
['**']`.

**M3 — Real-SQLite harness.** `src/__tests__/helpers/node-sqlite-db.ts` exports
`createTestDb(): SQLiteDatabase`-shaped object over `node:sqlite` `DatabaseSync(':memory:')` with
`execAsync(sql)`, `runAsync(sql, ...params)`, `getAllAsync<T>(sql, ...params)`,
`getFirstAsync<T>(sql, ...params)` (return `null` when `get()` is `undefined`). New suites:
`db-spots.test.ts` (insert/get/list excludes soft-deleted/partial update keeps other JSON
columns/status), `db-media.test.ts` (insert, list by spot ordered by created_at, delete),
`db-settings.test.ts` (defaults when empty, round trip), `db-migrate.test.ts` (fresh DB →
`PRAGMA user_version` = latest; running twice is a no-op; v1 DB upgrades). Migration mechanism:
`migrateDb` reads `PRAGMA user_version`, applies `MIGRATIONS[v]` in order inside a transaction,
sets `user_version`. Migration 1 = today's schema (idempotent `IF NOT EXISTS`). Later milestones add
migrations rather than editing migration 1. Keep the existing mocked tests; they still pass.

**M4 — Photos.** `src/utils/photo-storage.ts`: `photoRelativePath(spotId, mediaId) =
"photos/<spotId>/<mediaId>.jpg"`; `persistPhoto(sourceUri, spotId, mediaId): Promise<string>`
uses `expo-file-system` `File`/`Directory`/`Paths.document` (the SDK ≥ 19 API already in
`node_modules/expo-file-system/build/FileSystem.d.ts`), creates the directory, copies, returns the
relative path; `resolvePhotoUri(filePath)` returns `filePath` unchanged when it starts with
`file:`/`http`/`/` (legacy absolute rows) else `Paths.document.uri + filePath`. Tests mock
`expo-file-system` with an in-memory fake whose method names and signatures are copied from the
real `.d.ts` (rule: fakes mirror the live API). `src/db/media.ts` gains `getAllMedia(db)`.
`src/stores/media-store.ts`: `mediaBySpot: Record<string, Media[]>`, `setAll`, `add`, `remove`;
loaded in `use-db-init` after spots. Review screens call `persistPhoto` before `insertMedia` and
`addMedia`. `SpotListItem` receives `thumbnailUri = resolvePhotoUri(primary or first media)`.
Detail: horizontal gallery of all media (expo-image, `contentFit="cover"`), hero = primary. Fix
`index.tsx:101`. Deleting a spot leaves files (D3).

**M5 — Map.** `npx expo install react-native-maps`. `app/(tabs)/index.tsx` gets a header
`SegmentedControl` (component exists) Map | List, persisted in a `viewMode` field on the spots
store. `src/components/SpotMap.tsx`: `MapView` with `Marker` per filtered spot, `pinColor` differs
for drafts, `onCalloutPress → router.push('/spot/<id>')`, `showsUserLocation`, initial region =
current location (if known) else the bounding box of spots else Seattle. Jest: `__mocks__/
react-native-maps.tsx` exporting `MapView`/`Marker`/`Callout` as plain `View`s; test that N
spots render N markers and that a draft marker gets the draft colour. No clustering (D8). Note for
the Android future: Google Maps needs an API key; irrelevant for the iPhone.

**M6 — Names and import fixes.** `src/utils/exif.ts`: `parseExifDate("2026:10:13 14:22:01") →
"2026-10-13T14:22:01"` (local time, no zone; invalid → `undefined`), `exifGps(exif) → GeoPoint |
null` applying `GPSLatitudeRef`/`GPSLongitudeRef` signs. `src/utils/reverse-geocode.ts`:
`geocodeTown(point): Promise<string | undefined>` wrapping `Location.reverseGeocodeAsync`,
returning `city` → `subregion` → `region` → `undefined`, every error swallowed. Called from both
review screens after save (fire-and-forget, then `updateSpot({generated_name: town})`), and a
backfill in `use-db-init` for ≤ 10 spots per launch with no `name` and no `generated_name`.
`getSpotDisplayName` (D4): `name` → `Untitled · <generated_name> · <Mon D, h:mm AM>` →
`Untitled · <Mon D, h:mm AM>`; update the existing tests that expect `Untitled Spot — Oct 13`. `useCurrentLocation()` hook requests
foreground permission once and fills the location store; mounted by the Spots screen so distances
and the map's "me" work.

**M7 — Handoff.** `package.json`: `"start:tailscale": "REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale
ip -4) expo start"`. `docs/RUNNING-ON-PHONE.md`: install Expo Go, both devices on the tailnet, run
the script, scan the QR, what to expect, how to reload. `CLAUDE.md` rewritten to the real state
(stack, commands, branch policy from D7, testing rules incl. the node:sqlite harness, Expo Go
delivery). README: what it is, status, commands, "Not done yet". Smoke: start Metro in the
background on the Tailscale address, `curl -sS -o /dev/null -w '%{http_code}'
"http://100.88.90.97:8081/index.bundle?platform=ios&dev=true"` → 200 and the first bytes are JS;
stop Metro. Record the exact QR URL (`exp://100.88.90.97:8081`) in the Status log.

---

## 3. Explicitly out of scope tonight

Supabase / auth / sync / sharing / crews / folders; Mapbox and offline tiles; video; EAS, dev
builds, TestFlight, App Store; Android testing; semantic search; LiDAR / ML; web build; pin
clustering; deleting photo files; redesign of the visual style; renaming the repo or app;
touching `main`, `~/projects`, or `~/projects/dj-crate-streaming`.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| SDK hops break Jest/Reanimated/compiler and eat the night | 2 h time box, commit per green hop, abandon to last green hop, everything else proceeds on 54 |
| Expo Go on the App Store moves to SDK 58 before Michael tries the app (58 is `next` on npm today) | the review conversation does one more hop with the same per-hop recipe; the branch is left in a state where that is a 20-minute job |
| `jest-expo` ≥ 57 wants Jest 30 while memory says pin 29 | the pin is SDK-54-specific; follow `expo install --fix`; update memory + CLAUDE.md at wrap-up |
| jest-expo does not mock the new `expo-file-system` `File` API | manual mock from the real `.d.ts`; `persistPhoto` is the only module that imports it |
| `react-native-maps` version Expo installs is not in Expo Go | use exactly the version `npx expo install` picks (bundledNativeModules); verify with `expo-doctor` |
| Reverse geocoding spams Apple's geocoder | ≤ 10 per launch, sequential, only spots with neither `name` nor `generated_name` |
| `react-native-map-clustering` (S1) lags behind the `react-native-maps` version Expo installs | it is pure JS over `MapView`; if its peer range rejects the installed version, stop the spike and record it, do not override peers |
| Permission classifier denies `npm install`/network commands | try the narrower `npx expo install <pkg>`; else record under Needs Michael and continue |
| Metro smoke needs port 8081 free | `lsof -i :8081` first; use `--port 8082` if taken and record it |
| Lockfile churn makes the diff hard to review | one `chore:` commit per hop/install, feature commits never touch the lockfile |

---

## 5. Roadmap notes from Michael (2026-10-14, not for tonight)

- **Routes between spots**: pick several spots on the map and get a route/order for a session.
  Needs the map (M5) and distance (M6) first; later a directions provider.
- **Smart folders / tags**: drill into groups by city or by feature type (rail, ledge, …) instead
  of only filtering. The town stored by D4 and the existing `feature.type` are the two first
  group keys; the spec's `[FUTURE] Folder` filter is the manual version of the same idea.
- **Dev build + TestFlight**: Michael has an Apple developer account. After this run: `eas
  login` (Michael), `eas build --profile development --platform ios`, then TestFlight so the app
  no longer depends on the desktop running Metro. Also the moment Mapbox / offline tiles become
  possible.
- **Clustering** (D8) is the bridge between "several spots at one location" in the data model
  and a readable map.

---

## 6. Starting-state evidence (verbatim-ish)

```
$ npm run typecheck          → tsc --noEmit                           exit 0
$ npm run lint               → ESLint 9.39.2: could not find plugin "@typescript-eslint"   exit 2
$ npx jest --ci              → Test Suites: 10 passed, Tests: 115 passed, Time 6.694 s     exit 0
$ npx expo export --platform ios → _expo/static/js/ios/entry-….hbc (4.01 MB)            exit 0
$ npx expo-doctor            → 1 check failed: 9 packages out of date (patch)             exit 1
$ npm view expo dist-tags    → latest 57.0.28, next 58.0.9, sdk-54 54.0.37
$ git log main..origin/wip/laptop-2026-10-13 → bf3c36e WIP from laptop (package.json +1 line)
$ gh run list                → 2 runs on main, both failure (2026-02-12, 2026-02-15)
$ tailscale status           → pop-os 100.88.90.97 · iphone-15 (iOS) · michael (windows)
```
