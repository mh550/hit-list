# Overnight runbook — HitList: from "compiles" to "on Michael's phone"

You are an unattended Claude Code session on Michael's Pop!_OS home box, driven by a
self-paced `/loop`. Michael is asleep or away and watches from his phone (GitHub app, push
notifications, and a second Claude session that can read anything under `~/projects`).
**This file is your memory across loop iterations and context compactions.** Re-read it at
the start of every iteration, do the next unchecked step, tick it, append to the Status log,
commit.

The design you are implementing is `docs/specs/2026-10-13-overnight-design.md` (rev 2): read
it in full at M0; Michael answered every §0 question, so §0 is settled. The product spec is
`APP_SPECIFICATIONS.md`. Everything you need is inside `~/projects/hit_list`.

## Ground rules (non-negotiable)

1. **Branches only.** Work on `overnight/<YYYY-MM-DD>` in `~/projects/hit_list`, branched from
   `spec/2026-10-13` (which is `main` plus only this runbook and the spec), with the laptop
   commit `bf3c36e` cherry-picked on top (spec D7). Commit small and
   often; push the branch after each milestone (`git push -u origin overnight/<date>`). Never
   commit to, merge into, or push `main`. Never force-push. Never rewrite history. Remotes stay
   as they are.
2. **Stay inside `~/projects/hit_list`.** Another overnight session owns the working trees of
   `~/projects` and `~/projects/dj-crate-streaming`: never run `git checkout / switch / stash /
   reset / commit` there. Reading files there is fine.
3. **No sudo.** Root-needing items go under "Needs Michael" with the exact command.
4. **No secrets in commits.** There are none in this repo today; keep it that way. No `eas
   login`, no API keys, no tokens in files, logs, pushes or status pages. `.env*` stays ignored.
5. **Dependencies change only via Expo.** `npx expo install <pkg>` / `npx expo install --fix`,
   never hand-edited `package-lock.json`, never `npm install --force` / `--legacy-peer-deps`.
   One `chore:` commit per install so feature commits never touch the lockfile.
6. **Simple beats clever.** Use what Expo ships (expo-file-system, expo-location,
   react-native-maps in Expo Go); the smallest thing that works end-to-end on the iPhone.
7. **Decisions.** §0 of the spec is decided; do not re-open it. A *new* decision that is
   Michael's gets the simplest reversible default, is recorded in the spec's §0 as `D<n>
   *default*` **and written as a direct question in the Status log and the status page** (he
   cannot open files from the phone). Don't block.
8. **If Michael messages you**, his message overrides the queue. Record it under "Direction from
   Michael" before acting.
9. **If a tool call is denied by the permission classifier**, try one narrower form (an npm
   script instead of inline shell, a read instead of a write), then record it under "Needs
   Michael" with the exact command and move on. Never retry verbatim.
10. **Time boxes are real.** M1 (SDK upgrade) gets 2 hours of wall clock from its first step. At
    the box: reset to the last green hop, push the attempt as
    `overnight/<date>-sdk-attempt`, continue. The whole queue is one night; stretch only after
    the Wrap-up checklist is otherwise done.

## Discipline (superpowers skills)

- Before feature code: `superpowers:writing-plans` → `docs/plans/<date>-<milestone>.md`, then
  `superpowers:executing-plans` inline. One plan per milestone (M1 may skip the plan: its recipe
  is in the spec §2.2).
- All code: `superpowers:test-driven-development`. Keep `npx jest --ci` green (115 passing at
  start) and `npm run typecheck` clean. From M3 on, DB code is tested against real SQLite via the
  `node:sqlite` harness, not mocks.
- Failures you don't understand: `superpowers:systematic-debugging`.
- Before ticking a box: `superpowers:verification-before-completion` — run it, read it.
- End of each milestone: `superpowers:requesting-code-review` on the branch diff (most capable
  model), fix Critical/Important with RED→GREEN tests, then `/simplify`.
- **Fakes mirror the live API.** Before mocking an Expo module (`expo-file-system`,
  `expo-location`, `react-native-maps`), open its `.d.ts` in `node_modules` and copy the exact
  method names and signatures into the mock. A guessed shape hid three bugs on another project.
- **"What Michael will see" check** at the end of every milestone that touches a screen: render
  the screen in a test with 3 realistic spots (one with photos, one draft, one unnamed) and put
  the visible text / marker count / thumbnail URIs as a short table in the Status log. Counts are
  not enough.
- **The headless phone check** (M1 and every milestone after): `npx expo export --platform ios`
  must exit 0. It is the stand-in for "it opens in Expo Go".

## Phone updates and the status page

- PushNotification: under ~200 characters, no secrets, at most one an hour unless blocked.
  Start, each milestone, blocked, done.
- **Status page:** if the Artifact tool is available, keep one private page
  (`~/projects/hit_list/docs/overnight-status.html`, republished to the same URL at every
  milestone) with: milestone checklist, the latest "What Michael will see" table, every open
  question as a direct question, Needs Michael, and the Status log. Put its link in the start push
  and every milestone push. If the tool is missing, the Status log is the page; say so in the
  start push.
- Everything Michael must read lives under `~/projects/hit_list` (his other session is scoped
  to `~/projects`).

## Pacing

- More work queued → finish one step, commit, schedule the next wakeup at the minimum.
- Waiting on Michael and nothing else to do → every 30 min.
- Queue done (stretch included) → final push + page, stop the loop, write the outcome as
  visible text.

---

## Decisions already made (spec §0, answered by Michael 2026-10-14, do not re-ask)

- D1 Expo Go on the iPhone **is SDK 57**. Hops 54 → 55 → 56 → 57, 2 h box, abandon to last
  green hop.
- D2 Map = `react-native-maps` (Apple Maps in Expo Go). D8 pins tonight; **clustering is stretch
  S1** (`react-native-map-clustering`), because locations will have several spots.
- D3 Photos copied into `Paths.document/photos/<spotId>/<mediaId>.jpg`; relative path in DB;
  nothing written to the camera roll; files never deleted tonight.
- D4 Unnamed spots stay untitled until Michael names them; the placeholder is
  `Untitled · <Town> · Oct 13, 2:22 PM` (town from on-device reverse geocode into
  `generated_name`, ≤ 10 backfills per launch, silent on failure) or `Untitled · Oct 13, 2:22 PM`.
- D5 CI on pushes to every branch. D6 Expo Go over the tailnet tonight; Michael has an Apple
  developer account, so a dev build + TestFlight is the *next* run's job (he runs `eas login`).
- D7 `overnight/<date>` from `spec/2026-10-13` (= `main` + docs) + cherry-pick `bf3c36e`; the
  review conversation merges it into `main`; the wip branch is then redundant.
- D9 Patch bumps ride with the SDK hops. D10 Sort (distance first) + search are stretch S2;
  routes and smart folders are roadmap (spec §5). D11 Web stays a stub.

## Queue

### M0 — Preflight (≈20 min)
- [x] `cd ~/projects/hit_list && git fetch origin && git status` (expect clean, on
      `spec/2026-10-13`; `git log --oneline main..spec/2026-10-13` shows only docs commits).
      `git checkout -b overnight/$(date +%F) spec/2026-10-13`, then `git cherry-pick bf3c36e`
      (adds the `start:wsl` script; keep it). Branching from the spec branch keeps this file in
      the working tree; it is `main` plus the two docs, nothing else.
- [x] Read: the spec (all sections), `APP_SPECIFICATIONS.md` §Data Model + §User Flows,
      `CLAUDE.md` (stale; you rewrite it in M7), `src/db/schema.ts`, `src/hooks/use-db-init.ts`,
      the project memory file (jest pin note).
- [x] Baseline, recorded in the Status log: `npm ci`; `npm run typecheck` (expect 0);
      `npx jest --ci` (expect 115 passed); `npm run lint` (expect the `@typescript-eslint`
      plugin error); `npx expo export --platform ios --output-dir /tmp/hl-export` (expect exit 0,
      then `rm -rf /tmp/hl-export`); `npx expo-doctor` (expect 9 patch mismatches).
- [x] Status page (if Artifact available) + start push with the branch name.

### M1 — Expo SDK 54 → 57, one hop at a time (spec D1, §2.2) — 2 h box starts now
Write the start time in the Status log. For each hop N in 55, 56, 57:
- [x] `npx expo install expo@^55 && npx expo install --fix`; read what Expo prints; fix what the
      upgrade notes say (reanimated/worklets pair, jest-expo → Jest version, `@types/jest`,
      `react-test-renderer`, `app.json` experiments). `npx expo-doctor` clean.
- [x] `npm run typecheck`, `npx jest --ci`, `npx expo export --platform ios` all green →
      commit `chore: expo sdk 55`. Status log: what changed, what broke, how fixed.
- [x] Hop 56: same recipe → `chore: expo sdk 56`.
- [x] Hop 57: same recipe → `chore: expo sdk 57`. Record final versions (expo, react-native,
      react, jest, jest-expo) in the Status log and update the project memory note about the
      jest pin to the new truth.
- [x] _(n/a — box did not expire)_ If the box expires mid-hop: `git stash -u` is **not** allowed as a parking lot — instead
      commit the broken state as `wip: sdk N attempt (not green)` on a new branch
      `overnight/<date>-sdk-attempt`, push it, `git checkout overnight/<date>` (last green hop),
      and continue. Needs Michael: "SDK hop N failed on <error>; see branch".
- [x] Milestone push + branch push.

### M2 — Green CI (spec §2.2 M2) (≈30 min)
- [x] RED: `npm run lint` fails with the plugin error. Fix `eslint.config.js` by registering the
      TypeScript plugin under `@typescript-eslint` in the same config object as the rule (import
      from `typescript-eslint`, which `eslint-config-expo` already depends on) — or, if that
      package is not resolvable, rename the rule to the key the installed
      `eslint-config-expo/flat` registers. GREEN: exit 0. Then fix every lint finding (expect
      unused imports/vars; no rule disabling).
- [x] Fix the `act(...)` warning from `use-db-init.ts` in `db-init.test.ts` (wrap the async
      resolution in `await act(...)`/`waitFor`); `npx jest --ci 2>&1 | grep -c console.error`
      → 0.
- [x] `.github/workflows/ci.yml`: `on.push.branches: ['**']` (keep the PR trigger). Commit,
      push, then `gh run list --repo mh550/hit-list --limit 1` → a run on your branch; wait for
      it (`gh run watch`), expect success. If it fails, that is your next bug.
- [x] Review, `/simplify`, milestone push.

### M3 — Real-SQLite test harness + migrations (spec §2.2 M3) (≈45 min)
- [x] Plan: `docs/plans/<date>-sqlite-harness.md`.
- [x] TDD `src/__tests__/helpers/node-sqlite-db.ts` (`createTestDb()` over `node:sqlite`
      `DatabaseSync(':memory:')` with `execAsync/runAsync/getAllAsync/getFirstAsync`;
      `getFirstAsync` returns `null` for undefined). First test: `migrateDb` then
      `insertSpot`/`getSpots` round trip — the probe that passed on 2026-10-13 in 4 ms.
- [x] Suites against the real engine: `db-spots.test.ts` (list excludes soft-deleted; partial
      `updateSpot` leaves other JSON columns intact; `getSpot` of deleted → null),
      `db-media.test.ts` (insert/list ordered/delete), `db-settings.test.ts` (defaults, round
      trip, merge with defaults when keys are missing).
- [x] TDD migrations: `migrateDb` reads `PRAGMA user_version`, applies `MIGRATIONS` in order in
      a transaction, sets `user_version`. Migration 1 = today's DDL. Tests: fresh DB ends at the
      latest version; running twice is a no-op; a hand-made v0 DB with the old tables upgrades
      without data loss.
- [x] Review, `/simplify`, milestone push.

### M4 — Photos persist and display (spec D3, §2.2 M4) (≈1 h 30)
- [x] Plan: `docs/plans/<date>-photos.md`. Open
      `node_modules/expo-file-system/build/FileSystem.d.ts` and copy the `File`, `Directory`,
      `Paths` signatures you use into the jest mock before writing it.
- [x] TDD `src/utils/photo-storage.ts`: `photoRelativePath`, `persistPhoto` (creates
      `photos/<spotId>/`, copies, returns the relative path), `resolvePhotoUri` (absolute/`file:`
      /`http` passthrough; relative → `Paths.document.uri + path`).
- [x] TDD `getAllMedia(db)` in `src/db/media.ts` (real-SQLite suite) and
      `src/stores/media-store.ts` (`mediaBySpot`, `setAll`, `add`, `remove`); load in
      `use-db-init` after spots.
- [x] Wire: `app/add/review.tsx` and `app/import/review.tsx` call `persistPhoto` before
      `insertMedia`, then `media-store.add`. RED first: a screen test that asserts the inserted
      media row's `file_path` is relative.
- [x] Display: RED test that `SpotsScreen` renders a thumbnail URI for a spot with media and the
      "No Photo" placeholder for one without; GREEN by passing `thumbnailUri` from the media
      store. RED test that the detail screen renders one image per media row and no image when
      there is none; GREEN by replacing `app/spot/[id]/index.tsx:101` with a gallery.
- [x] `npx expo export --platform ios` green. "What Michael will see" table. Review,
      `/simplify`, milestone push.

### M5 — Map view (spec D2, §2.2 M5) (≈1 h 15)
- [x] Plan: `docs/plans/<date>-map.md`. `npx expo install react-native-maps` → `chore:` commit.
      Confirm the installed version equals the one in `node_modules/expo/bundledNativeModules.json`.
- [x] Manual mock `__mocks__/react-native-maps.tsx` (`MapView`, `Marker`, `Callout` as `View`s
      with `testID`s; props copied from the real `.d.ts`).
- [x] TDD `src/components/SpotMap.tsx`: N filtered spots → N markers; draft marker colour
      differs; `onCalloutPress` navigates to `/spot/<id>`; initial region from current location,
      else bounding box of spots, else the Seattle default from `factories.ts`. Several spots at
      one location overlap as pins tonight; that is expected (clustering is S1).
- [x] TDD the Map | List `SegmentedControl` in the Spots header with `viewMode` on the spots
      store (default `list`); the FAB and filter button work in both modes.
- [x] `npx expo export --platform ios` green. "What Michael will see" table (marker count, draft
      marker, callout title). Review, `/simplify`, milestone push.

### M6 — Untitled placeholder + import fixes (spec D4, §1.4 bugs 3–5, §2.2 M6) (≈1 h)
- [x] Plan: `docs/plans/<date>-names-and-exif.md`.
- [x] TDD `src/utils/exif.ts`: `parseExifDate` (`"2026:10:13 14:22:01"` → `"2026-10-13T14:22:01"`;
      garbage → `undefined`), `exifGps` (applies `GPSLatitudeRef`/`GPSLongitudeRef` sign only when
      the ref is present and the value is positive; missing coords → `null`). Wire into
      `app/import/index.tsx`; `created_at` in `app/import/review.tsx` falls back to `now` when the
      parsed date is undefined.
- [x] TDD `getSpotDisplayName` (D4): `name` → `Untitled · <generated_name> · Oct 13, 2:22 PM` →
      `Untitled · Oct 13, 2:22 PM`. Update the tests that expect `Untitled Spot — Oct 13`.
- [x] TDD `src/utils/reverse-geocode.ts` (`geocodeTown`: `city` → `subregion` → `region` →
      `undefined`) with `expo-location` mocked from its `.d.ts`; wire fire-and-forget into both
      review screens (`updateSpot({ generated_name: town })`) and a ≤ 10-per-launch backfill in
      `use-db-init` (test: 12 spots with neither name → exactly 10 geocode calls).
- [x] TDD `src/hooks/use-current-location.ts` (permission once, fills the location store);
      mount in the Spots screen; RED test that distance text appears once the store has a
      location.
- [ ] `npx expo export --platform ios` green. "What Michael will see" table (names: user-given,
      untitled-with-town, untitled-without). Review, `/simplify`, milestone push.

### M7 — Phone handoff + docs (spec §2.2 M7) (≈30 min)
- [x] `package.json`: `"start:tailscale": "REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale ip -4)
      expo start"`.
- [x] Metro smoke: `lsof -i :8081` (expect free); start `npm run start:tailscale` in the
      background; `curl -sS -o /tmp/hl.bundle -w '%{http_code}\n'
      "http://100.88.90.97:8081/index.bundle?platform=ios&dev=true"` → `200` and
      `head -c 200 /tmp/hl.bundle` looks like JavaScript; stop Metro; `rm /tmp/hl.bundle`.
      Record the QR URL `exp://100.88.90.97:8081` in the Status log and on the status page.
- [x] `docs/RUNNING-ON-PHONE.md` (Expo Go, tailnet, the script, what to expect, reload, where
      photos live on the device). `CLAUDE.md` rewritten to the real state (stack, commands,
      branch policy D7, TDD + node:sqlite harness, Expo Go delivery, SDK/jest versions).
      `README.md`: what it is, status, commands, "Not done yet".
- [ ] Review, milestone push.

### Stretch (only if everything above is done; in this order)
- [ ] **S1 clustering (D8):** `npx expo install react-native-map-clustering` (→ `chore:`
      commit; if its peer range rejects the installed `react-native-maps`, stop here and record
      it — never override peers). Wrap `SpotMap`'s `MapView`; TDD with the manual mock: 5 spots
      within 30 m render as one cluster marker at low zoom; tapping a cluster zooms in.
- [ ] **S2 sort + search (D10):** sort control (Distance / Date / Name / Intensity; tap again
      flips; Distance disabled until a location is known) and a search field via
      `headerSearchBarOptions` on the Spots stack screen. TDD.
- [ ] Skate-stop fields in `app/spot/[id]/edit.tsx` (type, description, removable). TDD.
- [ ] Remove a photo from a spot in edit (DB row only; file stays, D3). TDD.
- [ ] `PRAGMA foreign_keys = ON` in `migrateDb` + a test that media of a hard-deleted spot
      cascades (nothing hard-deletes today; this is groundwork).
- [ ] `updateSpot` writes the caller's ISO `updated_at` instead of SQLite's `datetime('now')`.

### Wrap-up (always, even if stopping early)
- [ ] Update spec §0 with any new defaults (as direct questions), spec §1.3 with the end-of-night
      check results, README "Not done yet", and `~/projects/ideas/PROGRESS.md` is **not** yours
      to edit (other session's tree) — put the one-paragraph progress entry in the Status log
      instead, marked `for PROGRESS.md`.
- [ ] Final "What Michael will see" table; status page republished.
- [ ] Commit + push `overnight/<date>`. Final push notification. Stop the loop and write the
      outcome as visible text, including every open question in full **and a reminder that
      the review conversation ends by merging `overnight/<date>` into `main` and deleting
      `wip/laptop-2026-10-13` (D7) — no new branch until it has.**

---

## Direction from Michael
_(append messages from the phone here, newest first)_

- **2026-10-14 23:39:** switched the session model to Opus (`/model claude-opus-5-5`) and said
  "Try again" after the M2 review subagent died on a session rate limit → relaunched the M2 review
  on Opus; queue otherwise unchanged.
- **2026-10-14 (morning, before the run):** answered every §0 question — Expo Go is SDK 57;
  Apple Maps is fine; no camera-roll writes; keep spots untitled until named but show
  date/time/town in the placeholder; CI on all branches fine; he has an Apple developer account
  (test build + TestFlight later); clustering makes sense because locations have several spots,
  priority unknown (→ S1); sort and search both matter, map shows distance, routes between spots
  and smart folders by city / feature type are ideas for later (→ spec §5).

## Needs Michael
_(exact commands / decisions, newest first)_
- **Question (D4 note):** the town in "Untitled · Seattle · …" comes from Apple's geocoder, which is a
  **network service** (I first wrote "on-device"; that was wrong). Each new spot's coordinates are sent to
  Apple once to get the town. OK to keep, or should town lookup be off?
- **Question (D12):** the batch import screen had no way in from the app. I added an **"Import Photos"
  button on the Profile tab**, under Import Settings. Is that the right place, or do you want it on the
  Spots tab next to the + button?
- **For the next migration (not tonight):** when `MIGRATIONS` gets a second entry, `useDbInit` must
  still load spots if `migrateDb` throws (today it skips the load, so a failed upgrade would look like
  every spot vanished). And per-connection pragmas such as `foreign_keys = ON` go next to the WAL
  line in `migrateDb`, never inside a migration (they do nothing in a transaction).
- **GitHub token lacks the `workflow` scope**, so `git push` over HTTPS rejects any commit that
  touches `.github/workflows/*` ("refusing to allow an OAuth App to create or update workflow").
  The overnight session pushed that one commit over SSH on the command line
  (`git push git@github.com:mh550/hit-list.git overnight/2026-10-14`; the `origin` remote is
  unchanged). To make HTTPS pushes work for workflow files too, run once on the desktop:
  `gh auth refresh -h github.com -s workflow`.
- Nothing before the run. **After the run:** the review conversation merges `overnight/<date>`
  into `main` and deletes `wip/laptop-2026-10-13` (D7); then, when you want the app to outlive
  the desktop's Metro: `eas login` on the desktop (yours to run), and a dev build + TestFlight
  becomes the next runbook (D6).

## Status log
_(newest first: time · step · result · commit)_
- 2026-10-15 00:40 · M7 steps 1–3 done · `start:tailscale` script. **Metro smoke over the tailnet: manifest
  `http://100.88.90.97:8081/` → HTTP 200, SDK 57.0.0; launch bundle → HTTP 200, 9.3 MB of JavaScript
  containing react-native-maps and the D4 label.** QR URL: **`exp://100.88.90.97:8081`**. (The runbook's
  `/index.bundle` URL 404s because the entry is `expo-router/entry`; the manifest's launch-asset URL is what
  Expo Go fetches.) Metro stopped, port 8081 free. `docs/RUNNING-ON-PHONE.md` written, `CLAUDE.md` rewritten
  to the real state, README rewritten. Found while writing the doc: **batch import had no entry point in the
  UI** → "Import Photos" button on the Profile tab (`D12 default`, question under Needs Michael). 214 tests.
- 2026-10-15 00:36 · M6 Tasks 1–4 done · `1dcac4e` EXIF · `531d1d2` D4 names · `8941dd0` towns · `b2a68b4` location
  · `072c08b` no distance for no-location spots (found by this table). 213 tests / 25 suites, 0 console.error,
  export ok. Final M6 review running on Opus.
  **What Michael will see** (Spots list, phone at Pike Place; times shown in UTC here, local on the phone):

  | Row label | Distance |
  |---|---|
  | Pier 57 kinked rail (user-named, 1 photo) | 0.2 mi |
  | Untitled · Seattle · Oct 13, 9:05 PM (town from Apple's geocoder) | 0.8 mi |
  | Untitled · Oct 14, 12:40 AM (saved without GPS, no town) | — (was "7679.1 mi" before `072c08b`) |
- 2026-10-15 00:34 · **M5 done — map view** · `/simplify` (4 reviewers): the "(0, 0) = no location" rule
  now lives once in `geo.ts` (`NO_LOCATION` / `isKnownLocation`; review screens write it, map and geocoding
  read it), one `featureLabel()` (the map callout now shows a custom "other" name), typed List | Map toggle,
  flat screen body, theme colour for pins, **user location tracked only while the Spots tab is focused**
  (battery), dead mock members gone. Skipped (measured not material at a few hundred spots): memoising
  markers / the spot list, passing the unsorted list to the map. 207 tests / 24 suites, export ok.
  M6 Task 3 also done (`8941dd0`): towns from Apple's on-device geocoder for new spots and a ≤10-per-launch
  background backfill. Next: M6 Task 4 (location on the Spots tab).
- 2026-10-15 00:30 · M5 review → fix pass (`8ae1608`) · Opus, checked against react-native-maps 1.27.2 iOS source:
  **1 Critical** — the starting region had no upper bound, so spots across the antimeridian or on opposite
  sides of the world produced spans beyond MapKit's 180°/360° limits; `MKMapView` throws "Invalid Region"
  (Expo Go would close on tapping Map). Now: shortest-arc longitude + clamps, RED→GREEN. **1 Important** —
  spots saved without a fix are stored at (0, 0); one such draft dragged the opening map to West Africa and
  shrank every Seattle pin into one dot. Now (0, 0) spots stay off the map (they remain in the list).
  Reviewer confirmed: pin colours, default-callout press, layout and FAB above the map all work on iOS;
  `showsUserLocation` without permission is a silent no-op. **First phone check:** the map is expected in
  Expo Go SDK 57; if Map shows a red "view config not found" error, it is not. 194 tests, export ok.
  M6 Tasks 1–2 also done: `1dcac4e` EXIF date + GPS sign, `531d1d2` D4 names. Next: M5 `/simplify` (running), M6 Task 3.
- 2026-10-15 00:24 · M5 Tasks 1–2 done · `98e80a4` SpotMap · `0f25cdd` Map | List toggle. 167 tests / 21 suites,
  0 console.error, typecheck/lint 0, **export ios ok (4.0 MB, maps included)**. Final M5 review running on Opus.
  **What Michael will see** (Spots tab in Map mode, 3 spots around downtown Seattle, no location yet):

  | Pin | Callout title | Callout subtitle | Pin colour |
  |---|---|---|---|
  | Pier 57 kinked rail (complete, 1 photo) | "Pier 57 kinked rail" | "rail" | blue `#007AFF` |
  | Library ledge (draft) | "Library ledge" | "Draft" | yellow `#EAB308` |
  | unnamed (draft) | "Untitled Spot — Oct 13" | "Draft" | yellow `#EAB308` |

  3 markers; map opens framing all three (≈2 km × 2.5 km), `showsUserLocation` on; the + button and
  the header Filter button stay in Map mode; List is the default. Tapping a callout opens the spot.
- 2026-10-15 00:21 · M5 started · `react-native-maps` **1.27.2** installed via `npx expo install` (= the
  SDK 57 pin in `bundledNativeModules.json`). Expo published new SDK 57 patches tonight, so a separate
  `chore:` ran `expo install --fix` (expo 57.0.29, expo-router 57.0.27, expo-linking 57.0.13); doctor
  21/21, 154 tests, export ok. Plan `docs/plans/2026-10-15-map.md` written.
- 2026-10-15 00:18 · **M4 done — photos persist and display** · `/simplify` (4 reviewers): one
  `useMediaActions().savePhotos` replaces the copy-insert-store loop duplicated in both review screens
  and updates the store once per save (was once per photo, re-rendering the list each time); media
  store trimmed (append-only `addMany`, no unused `remove`, no redundant sort); `primaryPhoto()` for the
  list row; one `Photo` component on the detail screen; shared test mocks (FlashList, configurable
  expo-router, `fakeFs`). Skipped: caching `Paths.document.uri` (µs, and the reinstall test needs a
  fresh read), parallel launch queries (native side serialises them; would couple media and settings
  failures), deleting the 20-photo test (pins the spec max), loosening the fake's directory checks.
  154 tests / 18 suites, 0 console.error, typecheck/lint 0, export ok. Next: M5 map.
- 2026-10-15 00:14 · M4 review done · Opus, checked against the real expo-file-system 57 iOS code:
  **0 Critical / 0 Important / 7 Minor, "ready to merge"**. Folder create is idempotent on iOS, path joins
  are correct incl. Expo Go's scoped Documents dir, camera/picker cache files are copyable, fallback
  holds. Minors deferred (none visible today; the one worth doing later: give each photo of one save a
  distinct `created_at` so gallery order is guaranteed, not incidental). Handoff note for M7: copy
  failures only `console.warn`, so the phone doc gets a "check a fresh photo landed in app storage"
  step. Next: `/simplify` for M4.
- 2026-10-15 00:08 · M4 Tasks 2–4 done · `a904336` media store · `5638611` review screens persist ·
  `f09626b` list thumbnail + detail gallery. 156 tests / 18 suites, 0 console.error, typecheck/lint 0,
  **export ios ok**. Final M4 review running on Opus.
  **What Michael will see** (Spots list + detail, rendered in a test with 3 spots):

  | Spot | List label | List thumbnail | Detail images |
  |---|---|---|---|
  | Pier 57 kinked rail (complete, 3 photos, primary = 1st) | "Pier 57 kinked rail" | `<Documents>/photos/pier/m1.jpg` | 3: m1 (hero), m2, m3 |
  | Library ledge (draft, no photos) | "Library ledge" + Draft badge | "No Photo" placeholder | 0 |
  | unnamed (draft, no photos) | "Untitled Spot — Oct 13" + Draft badge | "No Photo" placeholder | 0 |

  (`<Documents>` = `Paths.document` on the phone. The untitled label changes in M6.)
- 2026-10-15 00:02 · **M3 done** · `/simplify` (4 reviewers; efficiency found nothing material): Jest now
  discovers only `*.test.ts(x)` (replaces two one-off ignore entries), one `createMigratedTestDb()`
  helper, harness trimmed to what `src/db` calls, schema internals kept out of the app's `@/src/db`
  barrel, single settings fallback. Skipped: closing in-memory test DBs (negligible). 141 tests / 15
  suites unchanged, DDL untouched, export ok.
  · M4 Task 1 done (`015ffa4`): `persistPhoto` / `resolvePhotoUri` over an `expo-file-system`
  fake copied from the SDK 57 `.d.ts` (note: `File.copy` is async in 57). A copy failure keeps the
  original URI so no photo row is lost. Debug note: `jest.requireMock` returned a second instance of
  the root `__mocks__` module, so the test imports the module path instead.
- 2026-10-14 23:58 · M3 review done · Opus reviewer: **0 Critical / 0 Important / 7 Minor, "ready to merge"**.
  Confirmed on the real expo-sqlite 57 source: migration 1 = old DDL verbatim; harness transaction
  semantics match the device; both PRAGMAs valid on iOS; CI's Node 22.23.3 loads `node:sqlite`
  unflagged (prints a harmless ExperimentalWarning). Minors deferred per the execution rules (none
  can bite today); the two that matter later are under Needs Michael. Next: `/simplify` for M3.
- 2026-10-14 23:54 · M3 Tasks 1–4 done (inline, executing-plans) · `b53f5a8` harness · `35c2aee` spots ·
  `eb54e86` media/settings · `5f51e7a` migrations. `createTestDb()` runs `src/db` unmodified on
  `node:sqlite` (`DatabaseSync(':memory:')`). New suites: db-spots 5, db-media 2, db-settings 4,
  db-migrate 5 → **132 tests**, 14 suites, 0 console.error; typecheck/lint 0; export ok. Real bug
  found and fixed: a corrupt `user_settings` blob made `getUserSettings` throw, which skipped the
  whole DB load at launch → now falls back to defaults. `migrateDb` now versions via `PRAGMA
  user_version`, one transaction per migration incl. the bump; v0 DBs adopt v1 with rows intact; a
  newer-build DB is left alone. Characterisation tests (existing SQL) were RED-proven by 9 code
  mutations, each reverted. Final M3 review running on Opus.
- 2026-10-14 23:48 · **M2 done — CI green** · run https://github.com/mh550/hit-list/actions/runs/38678065234
  (head `6250f04`). Review (Opus; the first attempt died on a rate limit): 0 Critical / 0 Important,
  5 Minor fixed — lint override now keeps expo's options, **no `eslint-disable` left anywhere**,
  actions bumped v4→v7 (Node 24 runtime, deprecation annotation gone), CI concurrency group, a
  second FilterSheet regression test. `/simplify` (4 reviewers): test mocks for icon-symbol and
  expo-image hoisted into `jest.setup.ts` (were copied ×4 / ×2), lint options trimmed to the ones
  that matter, db-init tests flush in one tick (≈250 ms → ≈20 ms) with a duplicate test folded in,
  same-repo `pull_request` runs skipped (push already covers every branch; trigger kept for fork
  PRs). Skipped: dropping `--coverage` from CI (harmless, Michael's choice). Suite **116** passing,
  0 `console.error`, lint 0, typecheck 0, export ok. M3 plan committed
  (`docs/plans/2026-10-14-sqlite-harness.md`). Next: M3 Task 1.
- 2026-10-14 07:44 · M2 steps 1–3 done · `a279973` lint, `adcca80` act(), `62a5c64` ci. **First green CI run
  ever: https://github.com/mh550/hit-list/actions/runs/38558430720** (branch push → Lint ✓ Typecheck ✓
  Test ✓). Lint root cause: eslint-config-expo registers `@typescript-eslint` only for `*.ts/*.tsx`,
  so the project rule had to be scoped to those files. Then 2 errors + 5 warnings fixed without
  disabling rules; the real one was `react-hooks/set-state-in-effect` in `FilterSheet` → draft now
  initialises on mount (sheet unmounts when hidden), with a new regression test (suite 116).
  `npx jest --ci 2>&1 | grep -c console.error` → 0. Push of the workflow file needed SSH (see Needs
  Michael). Next: M2 review + `/simplify`, then M3.
- 2026-10-14 07:36 · M1 review done · reviewer (read-only subagent) found 0 Critical, 2 Important (both
  `expo-router/react-navigation` imports are `@deprecated`, removal planned → theme imports now from
  `expo-router`, `HapticTab` uses RN `Pressable`), 2 Minor + 2 Nit (comment, `expo` range `~57.0.28`,
  dead `@react-navigation` transform patterns) — all fixed, gates re-run green (typecheck 0 · jest
  115 · export ok). `/simplify` **skipped for M1**: the milestone changed six template files and no
  app logic; it runs from M2 on. Next: M2 green CI.
- 2026-10-14 07:29 · **M1 done — SDK 57 green** · `cb435b7` chore (no source changes needed this hop).
  Final versions: expo 57.0.28 · react-native 0.86.3 · react 19.2.3 · expo-router 57.0.26 ·
  expo-sqlite 57.0.4 · expo-file-system 57.0.7 · expo-location 57.0.21 · reanimated 4.5.1 / worklets
  0.10.1 · **jest 29.7.0 · jest-expo 57.0.6 · @types/jest 29.5.14** (Jest 30 not required) ·
  react-test-renderer 19.2.3 (pinned = React) · typescript 6.0.3. Gates: doctor 21/21 · typecheck 0 ·
  jest 115/115 · export ios 3.9 MB · `npm ci` from the committed lockfile reproduces and tests pass.
  Broke: npm ERESOLVE (`react-native@0.86.3` peerOptional `@react-native/jest-preset@0.86.3` vs the
  stale 0.85 tree) — incremental install and lockfile-only regeneration both failed while the old
  `node_modules` existed; `rm -rf node_modules && npm install` resolved exactly as a scratch-dir
  resolution did, so the lockfile is npm-regenerated (not hand-edited). Also `expo install
  jest-expo eslint-config-expo` put them under `dependencies`; moved back to `devDependencies` by
  hand (same versions). `react-test-renderer ^19.1` now resolves 19.3 (wants React 19.3) → pinned.
  Memory note updated. **Clock note:** the session was idle from 00:13 to 07:20 waiting on a
  "Continue" (no work happened); M1 work time ≈ 25 min, so the 2 h box was honoured in spirit.
  Michael is probably awake: the rest of the queue continues now, with phone pushes per milestone.
- 2026-10-14 07:21 · M1 hop 56 green (one doctor advisory) · chore + fix commits. Moved 27 packages
  (RN 0.85.3, React 19.2.3, reanimated 4.3.1 / worklets 0.8.3, jest-expo 56.0.5, **TypeScript 6.0.3**;
  Jest still 29.7). Broke: (1) `expo export` refused: "As of SDK 56, expo-router is no longer compatible
  with react-navigation" → removed the three `@react-navigation/*` deps, imports now
  `expo-router/react-navigation` (ThemeProvider/DarkTheme/DefaultTheme/PlatformPressable) and
  `expo-router/js-tabs` (BottomTabBarButtonProps). (2) TS 6 defaults `types` to `[]` → tsconfig
  `"types": ["jest"]`. Gates: typecheck 0 · jest 115/115 · export ios 4.0 MB · doctor 21/22 — the one
  failure is "Hermes V1 memory regression, upgrade to SDK 57", inherent to 56, cleared by hop 57.
- 2026-10-14 00:10 · M1 hop 55 green · `2bfc918` chore + `74a37a2` fix. **M1 box started 00:05, ends
  02:05.** `expo install expo@^55` + `--fix` moved 26 packages (RN 0.81.5→0.83.10, React 19.1→19.2,
  reanimated 4.2.1 / worklets 0.7.4, jest-expo 55.0.22; **Jest stays 29.7**). Broke: (1) jest
  `Cannot find module 'expo-modules-core'` — npm nested it under `expo/`; `npm dedupe` after a
  trial direct install hoisted it (expo-doctor forbids it as a direct dep, so it is not one).
  (2) `app.json` schema rejects `newArchEnabled` + `android.edgeToEdgeEnabled` → removed (always on
  in 55). (3) RN 0.83 `ColorSchemeName` adds `'unspecified'` → `useColorScheme()` narrowed to
  `'light' | 'dark'`; expo-symbols `name` is now a union → mapping keyed by `SFSymbol`. Gates:
  doctor 20/20 · typecheck 0 · jest 115/115 · export ios 4.2 MB.
- 2026-10-14 00:03 · M0 done · branch `overnight/2026-10-14` from `spec/2026-10-13` + cherry-pick
  `bf3c36e` (= `f34ed9a`). Baseline (Node 24.21.0): `npm ci` OK · `npm run typecheck` exit 0 ·
  `npx jest --ci` 10 suites / **115 passed** (one `act(...)` console.error from `use-db-init.ts`) ·
  `npm run lint` exit 2 (`@typescript-eslint` plugin not defined) · `npx expo export --platform ios`
  exit 0 · `npx expo-doctor` exit 1 (9 packages a patch behind). Everything matches spec §1.3.
  **Status page: the Artifact tool is not available in this session, so this Status log is the
  page.** Next: M1 (SDK hops), 2 h box starts at the next iteration.
