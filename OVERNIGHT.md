# Overnight runbook — HitList: from "compiles" to "on Michael's phone"

You are an unattended Claude Code session on Michael's Pop!_OS home box, driven by a
self-paced `/loop`. Michael is asleep or away and watches from his phone (GitHub app, push
notifications, and a second Claude session that can read anything under `~/projects`).
**This file is your memory across loop iterations and context compactions.** Re-read it at
the start of every iteration, do the next unchecked step, tick it, append to the Status log,
commit.

The design you are implementing is `docs/specs/2026-10-13-overnight-design.md` (rev 1): read
it in full at M0 and treat its §0 decisions as settled defaults. The product spec is
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

## Decisions already made (spec §0, do not re-ask)

- D1 SDK 54 → 55 → 56 → 57, one hop at a time, 2 h box, abandon to last green hop.
- D2 Map = `react-native-maps` (Apple Maps in Expo Go). D8 no clustering.
- D3 Photos copied into `Paths.document/photos/<spotId>/<mediaId>.jpg`; relative path in DB;
  files never deleted tonight.
- D4 Names via `expo-location` reverse geocode, ≤ 10 backfills per launch, silent on failure.
- D5 CI on pushes to every branch. D6 Expo Go over the tailnet is the delivery path.
- D7 `overnight/<date>` from `spec/2026-10-13` (= `main` + docs) + cherry-pick `bf3c36e`; the
  review conversation merges it into `main` and deletes `wip/laptop-2026-10-13`.
- D9 Patch bumps ride with the SDK hops. D10 Sort/search UI is stretch. D11 Web stays a stub.

## Queue

### M0 — Preflight (≈20 min)
- [ ] `cd ~/projects/hit_list && git fetch origin && git status` (expect clean, on
      `spec/2026-10-13`; `git log --oneline main..spec/2026-10-13` shows only docs commits).
      `git checkout -b overnight/$(date +%F) spec/2026-10-13`, then `git cherry-pick bf3c36e`
      (adds the `start:wsl` script; keep it). Branching from the spec branch keeps this file in
      the working tree; it is `main` plus the two docs, nothing else.
- [ ] Read: the spec (all sections), `APP_SPECIFICATIONS.md` §Data Model + §User Flows,
      `CLAUDE.md` (stale; you rewrite it in M7), `src/db/schema.ts`, `src/hooks/use-db-init.ts`,
      the project memory file (jest pin note).
- [ ] Baseline, recorded in the Status log: `npm ci`; `npm run typecheck` (expect 0);
      `npx jest --ci` (expect 115 passed); `npm run lint` (expect the `@typescript-eslint`
      plugin error); `npx expo export --platform ios --output-dir /tmp/hl-export` (expect exit 0,
      then `rm -rf /tmp/hl-export`); `npx expo-doctor` (expect 9 patch mismatches).
- [ ] Status page (if Artifact available) + start push with the branch name.

### M1 — Expo SDK 54 → 57, one hop at a time (spec D1, §2.2) — 2 h box starts now
Write the start time in the Status log. For each hop N in 55, 56, 57:
- [ ] `npx expo install expo@^55 && npx expo install --fix`; read what Expo prints; fix what the
      upgrade notes say (reanimated/worklets pair, jest-expo → Jest version, `@types/jest`,
      `react-test-renderer`, `app.json` experiments). `npx expo-doctor` clean.
- [ ] `npm run typecheck`, `npx jest --ci`, `npx expo export --platform ios` all green →
      commit `chore: expo sdk 55`. Status log: what changed, what broke, how fixed.
- [ ] Hop 56: same recipe → `chore: expo sdk 56`.
- [ ] Hop 57: same recipe → `chore: expo sdk 57`. Record final versions (expo, react-native,
      react, jest, jest-expo) in the Status log and update the project memory note about the
      jest pin to the new truth.
- [ ] If the box expires mid-hop: `git stash -u` is **not** allowed as a parking lot — instead
      commit the broken state as `wip: sdk N attempt (not green)` on a new branch
      `overnight/<date>-sdk-attempt`, push it, `git checkout overnight/<date>` (last green hop),
      and continue. Needs Michael: "SDK hop N failed on <error>; see branch".
- [ ] Milestone push + branch push.

### M2 — Green CI (spec §2.2 M2) (≈30 min)
- [ ] RED: `npm run lint` fails with the plugin error. Fix `eslint.config.js` by registering the
      TypeScript plugin under `@typescript-eslint` in the same config object as the rule (import
      from `typescript-eslint`, which `eslint-config-expo` already depends on) — or, if that
      package is not resolvable, rename the rule to the key the installed
      `eslint-config-expo/flat` registers. GREEN: exit 0. Then fix every lint finding (expect
      unused imports/vars; no rule disabling).
- [ ] Fix the `act(...)` warning from `use-db-init.ts` in `db-init.test.ts` (wrap the async
      resolution in `await act(...)`/`waitFor`); `npx jest --ci 2>&1 | grep -c console.error`
      → 0.
- [ ] `.github/workflows/ci.yml`: `on.push.branches: ['**']` (keep the PR trigger). Commit,
      push, then `gh run list --repo mh550/hit-list --limit 1` → a run on your branch; wait for
      it (`gh run watch`), expect success. If it fails, that is your next bug.
- [ ] Review, `/simplify`, milestone push.

### M3 — Real-SQLite test harness + migrations (spec §2.2 M3) (≈45 min)
- [ ] Plan: `docs/plans/<date>-sqlite-harness.md`.
- [ ] TDD `src/__tests__/helpers/node-sqlite-db.ts` (`createTestDb()` over `node:sqlite`
      `DatabaseSync(':memory:')` with `execAsync/runAsync/getAllAsync/getFirstAsync`;
      `getFirstAsync` returns `null` for undefined). First test: `migrateDb` then
      `insertSpot`/`getSpots` round trip — the probe that passed on 2026-10-13 in 4 ms.
- [ ] Suites against the real engine: `db-spots.test.ts` (list excludes soft-deleted; partial
      `updateSpot` leaves other JSON columns intact; `getSpot` of deleted → null),
      `db-media.test.ts` (insert/list ordered/delete), `db-settings.test.ts` (defaults, round
      trip, merge with defaults when keys are missing).
- [ ] TDD migrations: `migrateDb` reads `PRAGMA user_version`, applies `MIGRATIONS` in order in
      a transaction, sets `user_version`. Migration 1 = today's DDL. Tests: fresh DB ends at the
      latest version; running twice is a no-op; a hand-made v0 DB with the old tables upgrades
      without data loss.
- [ ] Review, `/simplify`, milestone push.

### M4 — Photos persist and display (spec D3, §2.2 M4) (≈1 h 30)
- [ ] Plan: `docs/plans/<date>-photos.md`. Open
      `node_modules/expo-file-system/build/FileSystem.d.ts` and copy the `File`, `Directory`,
      `Paths` signatures you use into the jest mock before writing it.
- [ ] TDD `src/utils/photo-storage.ts`: `photoRelativePath`, `persistPhoto` (creates
      `photos/<spotId>/`, copies, returns the relative path), `resolvePhotoUri` (absolute/`file:`
      /`http` passthrough; relative → `Paths.document.uri + path`).
- [ ] TDD `getAllMedia(db)` in `src/db/media.ts` (real-SQLite suite) and
      `src/stores/media-store.ts` (`mediaBySpot`, `setAll`, `add`, `remove`); load in
      `use-db-init` after spots.
- [ ] Wire: `app/add/review.tsx` and `app/import/review.tsx` call `persistPhoto` before
      `insertMedia`, then `media-store.add`. RED first: a screen test that asserts the inserted
      media row's `file_path` is relative.
- [ ] Display: RED test that `SpotsScreen` renders a thumbnail URI for a spot with media and the
      "No Photo" placeholder for one without; GREEN by passing `thumbnailUri` from the media
      store. RED test that the detail screen renders one image per media row and no image when
      there is none; GREEN by replacing `app/spot/[id]/index.tsx:101` with a gallery.
- [ ] `npx expo export --platform ios` green. "What Michael will see" table. Review,
      `/simplify`, milestone push.

### M5 — Map view (spec D2, §2.2 M5) (≈1 h 15)
- [ ] Plan: `docs/plans/<date>-map.md`. `npx expo install react-native-maps` → `chore:` commit.
      Confirm the installed version equals the one in `node_modules/expo/bundledNativeModules.json`.
- [ ] Manual mock `__mocks__/react-native-maps.tsx` (`MapView`, `Marker`, `Callout` as `View`s
      with `testID`s; props copied from the real `.d.ts`).
- [ ] TDD `src/components/SpotMap.tsx`: N filtered spots → N markers; draft marker colour
      differs; `onCalloutPress` navigates to `/spot/<id>`; initial region from current location,
      else bounding box of spots, else the Seattle default from `factories.ts`.
- [ ] TDD the Map | List `SegmentedControl` in the Spots header with `viewMode` on the spots
      store (default `list`); the FAB and filter button work in both modes.
- [ ] `npx expo export --platform ios` green. "What Michael will see" table (marker count, draft
      marker, callout title). Review, `/simplify`, milestone push.

### M6 — Names + import fixes (spec D4, §1.4 bugs 3–5, §2.2 M6) (≈1 h)
- [ ] Plan: `docs/plans/<date>-names-and-exif.md`.
- [ ] TDD `src/utils/exif.ts`: `parseExifDate` (`"2026:10:13 14:22:01"` → `"2026-10-13T14:22:01"`;
      garbage → `undefined`), `exifGps` (applies `GPSLatitudeRef`/`GPSLongitudeRef` sign only when
      the ref is present and the value is positive; missing coords → `null`). Wire into
      `app/import/index.tsx`; `created_at` in `app/import/review.tsx` falls back to `now` when the
      parsed date is undefined.
- [ ] TDD `src/utils/reverse-geocode.ts` (`geocodeSpotName`) with `expo-location` mocked from
      its `.d.ts`; wire fire-and-forget into both review screens and a ≤ 10-per-launch backfill
      in `use-db-init` (test: 12 unnamed spots → exactly 10 geocode calls).
- [ ] TDD `src/hooks/use-current-location.ts` (permission once, fills the location store);
      mount in the Spots screen; RED test that distance text appears once the store has a
      location.
- [ ] `npx expo export --platform ios` green. "What Michael will see" table (names: user,
      geocoded, fallback). Review, `/simplify`, milestone push.

### M7 — Phone handoff + docs (spec §2.2 M7) (≈30 min)
- [ ] `package.json`: `"start:tailscale": "REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale ip -4)
      expo start"`.
- [ ] Metro smoke: `lsof -i :8081` (expect free); start `npm run start:tailscale` in the
      background; `curl -sS -o /tmp/hl.bundle -w '%{http_code}\n'
      "http://100.88.90.97:8081/index.bundle?platform=ios&dev=true"` → `200` and
      `head -c 200 /tmp/hl.bundle` looks like JavaScript; stop Metro; `rm /tmp/hl.bundle`.
      Record the QR URL `exp://100.88.90.97:8081` in the Status log and on the status page.
- [ ] `docs/RUNNING-ON-PHONE.md` (Expo Go, tailnet, the script, what to expect, reload, where
      photos live on the device). `CLAUDE.md` rewritten to the real state (stack, commands,
      branch policy D7, TDD + node:sqlite harness, Expo Go delivery, SDK/jest versions).
      `README.md`: what it is, status, commands, "Not done yet".
- [ ] Review, milestone push.

### Stretch (only if everything above is done)
- [ ] Sort control (Date / Name / Distance / Intensity; tap again flips) and a search field via
      `headerSearchBarOptions` on the Spots stack screen (D10). TDD.
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

- _(none yet)_

## Needs Michael
_(exact commands / decisions, newest first)_
- **D1** — open Expo Go on the iPhone and read the SDK version it supports (Settings in Expo
  Go, or the App Store listing). Reply "Expo Go is 57" or "Expo Go is 58".
- **D6** — do you have an Apple developer account? If yes, `eas login` on the desktop later is
  yours to run (never the overnight session's).
- **Answer D2, D3, D4, D5, D7, D8, D10** from spec §0 whenever convenient; defaults hold until then.

## Status log
_(newest first: time · step · result · commit)_
- _(the overnight session starts here)_
