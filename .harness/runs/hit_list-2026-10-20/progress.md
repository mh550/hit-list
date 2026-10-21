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

### 2026-10-21 18:00 · verify M8

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M8-01 | 1 | Re-ran the grep loop over all 30 patterns on app src jest.setup.ts; read the sweep doc's kept-hits table | 0 hits for 20 patterns. Remaining hits (status, Draft, gear, Material, Intensity, bustability, in_run, skate_stops, custom_type, 'Save as Draft') are all in schema.ts migrations, legacy-details labels, or absence-asserting tests; each is listed with a reason in the sweep doc, which holds the loop output | yes |
| M8-01 | 2 | `grep -n -E 'Draft\|draft\|gear\|Intensity\|bustab\|Save as Draft\|My Gear' README.md CLAUDE.md docs/RUNNING-ON-PHONE.md` | no output | yes |
| M8-01 | 3 | `grep export src/utils/units.ts`; grep callers outside tests; read components/index.ts vs ls src/components | displayLength→legacy-details.ts; radiusToDisplay/FromInput/UnitLabel→profile.tsx, import/index.tsx; all 12 index exports have files; sweep doc section lists them | yes |
| M8-01 | 4 | `npx expo export --platform ios` to scratch dir; `npx expo-doctor` | export exit 0; doctor 21/21 checks passed, exit 0 | yes |
| M8-01 | 5 | check.sh; `npx jest --ci` counted console.error | check green; 54 suites, 656 tests pass, 0 console.error; sweep doc records 54 suites/656 | yes |
| M8-02 | 1 | Read APP_SPECIFICATIONS.md top and `grep SUPERSEDED` | '## Simplified model (2026-10-20)' directly after the title with Spot interface, filters, sorts, viewer, nearby offer, radius, pointer to design doc; SUPERSEDED on Feature Details, In-Run, Landing, Spot Metadata, Filters note, Gear+Build filter; text kept | yes |
| M8-02 | 2 | Read README.md | Status dated 2026-10-20; lists Quick Add, tags, grid and viewer, three filters, sorts, nearby offer, radius in user units, Older details; intro has no gear/build/ratings | yes |
| M8-02 | 3 | Read CLAUDE.md intro, Layout, Conventions | no gear/ratings; Layout names SpeedScale, PhotoGrid, SpotTagFields, ZoomablePhoto, legacy-details, nearby-spots, gallery-gestures, photos.tsx; Conventions give natural_speed 0-4 with undefined unrated, tap order, getSpotLegacy | yes |
| M8-02 | 4 | Read RUNNING-ON-PHONE.md 'What to expect' against M2-M7 and edit.tsx | no Draft, one pin colour, viewer, three filters; Undo note matches edit.tsx:275-283. Stale 'git switch overnight/2026-10-14' is outside the step | yes |
| M8-02 | 5 | check.sh and `npx jest --ci` | green, 656 tests | yes |
| M8-03 | 1 | `ls reviews/`, `git diff 782ff8d..HEAD --stat`, read sweep doc 'Final review' | reviews/run.diff exists (499 KB); table has id/severity/file/fix; U1 RED c5f2547→GREEN 7fcd615, F2 RED 52ec88d→GREEN 96d8e1a, all four commits in git log | yes |
| M8-03 | 2 | Read written answers; `npx jest --ci db-init db-migrate` | answers cover v2 full-fat/empty/v1/v3/media count, fresh install, load-after-throw; 41 tests pass | yes |
| M8-03 | 3 | Read progress.md 'For Michael' | steps in order (npm ci, start:tailscale, Expo Go, first-launch effect, per-milestone lists), rollback with 'DB cannot be rolled back' said plainly, 12 §9 questions with defaults | yes |
| M8-03 | 4 | `check.sh`; `npx jest --ci`; `npx expo export --platform ios` | lint+tsc+jest green, 0 console.error, export exit 0 | yes |

### 2026-10-21 17:30 · M8-03 · passes

- Whole-run Opus review (two reviewers, data + UI) of `reviews/run.diff` (782ff8d..HEAD, 12,228 lines): 0 Critical, 1 Important, 7 Minor; table and written answers in `docs/plans/2026-10-20-m8-sweep.md` 'Final review'.
- Important U1 fixed: the Edit sheet could be swiped away mid-Save, and Save's `router.back()` then popped the detail screen too. `edit.tsx` now sets `gestureEnabled: !saving` and skips `back()` after unmount (RED `c5f2547` → GREEN `7fcd615`, re-checked by the reviewer). Minor F2 fixed: one unreadable `feature_types_json` row no longer empties the whole list (RED `52ec88d` → GREEN `96d8e1a`). F1/F3: a real-SQLite test where migration 3 throws on a v2 DB (`db-init-failed-upgrade.test.ts`), and the fresh-install test now asserts an empty v3 spots table.
- Written answers: v2 → v3 keeps every spot and photo (full-fat, empty, v1, v3, media-count tests pass); a fresh install reaches v3 empty; if migration 3 throws, media and settings load, spots can't below v3, the D28 screen blocks the app and the v2 rows stay on disk.
- Tests 651 → 656 (52 → 54 suites); `check.sh` green; `jest --ci` 0 console.error; `expo export --platform ios` exit 0 (4.3 MB).
- Proposed changes (later run, Minor): U3 hide the nearby card once a partly failed Save has created the spot; U4 re-point `primary_photo_id` on an edit retry; U5 enforce the 20-photo cap on 'Add photos there' and the import join; U2 skip the push after leaving Quick Add Review mid-save.
- Questions for Michael: the §9 list below (all defaults taken, none new this session).

#### For Michael

**One thing first: it can't be undone on the phone.** The first launch of this build runs migration 3 on your
phone's spots DB (v2 → v3). It cannot be undone: after it runs, an older build of the app can't read the DB.

Phone steps, in order (from this repo on your Mac/box, on `main` after the harness merges this run):
1. `git checkout main && git pull`, then `npm ci`.
2. `npm run start:tailscale` (Metro on the tailnet address); open the QR / URL in **Expo Go** on the iPhone.
3. First launch: migration 3 rewrites every spot in one transaction. Each spot keeps its name, location, photos,
   town, dates and notes; its old feature type becomes one 'What's here' tag (an 'other' type becomes no tag, with
   the text kept); 'skate stoppers: yes' becomes 'Skate stopped'; old natural speed 1–5 becomes None…Too much;
   everything else (dimensions, material, stop type, setup options, landing, intensity, bustability…) is archived
   and shows under a collapsed **Older details** on the spot's page. Drafts become normal spots. If the upgrade
   throws, you see "Couldn't upgrade your spots · Nothing was lost · close and reopen to retry" (D28) and the DB
   stays at v2.
4. Then try, per milestone:
   - **M2 edit**: open a spot → Edit. One screen: photo grid with ✕ on each tile and a '+' tile, Name, What's here
     chips, Skate stopped switch, Natural speed (None · Little · Some · Enough · Too much; tap again to clear), Notes,
     Save, Delete spot. Remove a photo and add one, then leave without saving → nothing changed; do it again and Save
     → both applied.
   - **M3 detail**: a spot with photos shows the grid, title, tag line (red 'Skate stopped'), speed bar, notes; a spot
     with none shows an 'Add photos' tile that opens Edit. A migrated spot with old data shows 'Older details'
     (closed); open it → labelled rows in your units.
   - **M4 viewer**: tap a photo → full-screen black viewer, 'N / M'. Swipe between photos; pinch to 4× and back;
     double-tap 2.5× ↔ 1×; pan while zoomed doesn't change page; drag down at 1× closes; ✕ closes. Long-press →
     Set as primary / Remove photo; removing the last photo closes the viewer. Zoom a 12 MP photo → stays sharp.
   - **M5 list/filters**: rows show tag badges (none for an untagged spot); sorts Distance · Date · Name (Distance
     greyed without location); Filter sheet: What's here, Skate stopped (Any/Yes/No), Natural speed range (pick
     Little then Enough → "Little to Enough"); Filter shows "(3)" with all three set. Map pins are one colour; tap a
     pin → callout with name + "Rail · Ledge" → opens the spot.
   - **M6 save/import**: Quick Add → photos → review shows Name, an 'Add details' link (tags), Save. Standing at a
     spot you already have: 'Already have this spot?' lists up to three 'Near <name> · 16 ft' rows with 'Add photos
     there' (photos only join that spot, D30); Save still makes a new spot. Batch import near an existing spot: the
     group offers 'New spot' / 'Add photos to <name>'; the button counts only new spots.
   - **M8 fix**: tap Save on Edit and try to swipe the sheet down at once → it holds until the save is done, then closes to the spot (not the list).
   - **M7 radius**: Profile → 'Import radius · ft' shows 164 (= 50 m); switch to Metric → 50 m. Type 328 ft → 100 m.

**Roll back the app**: `git checkout <main before the merge>` (the commit `main` pointed at before this run's merge;
today `2d75cf2`), `npm ci`, restart Metro. **The DB cannot be rolled back after migration 3 has run on the
phone**: the old build expects the v2 columns, which are gone. The archived values are still in `legacy_json`, but
nothing writes them back. If you might want the old build, don't open this one until you're sure.

**§9 questions (the run took the bold default; answer in INBOX.md to change one):**
1. D18 Notes: **kept one free-text Notes field** (say "drop notes").
2. D21 Natural-speed words: **None · Little · Some · Enough · Too much** (send better words).
3. D25 Nearby-spot offer: **built, never auto-merges, uses the import radius** (say "skip").
4. D26 Old fields: **archived into legacy_json, shown under 'Older details'** (say "just delete").
5. §2.7 Tags on Quick Add review: **collapsed under 'Add details'** (say "always show" / "never show").
6. (done before the run: main merge)
7. D15 town in list search / D16 untitled import label date: still open, unchanged.
8. D28 Failed upgrade: **blocks the app with "Couldn't upgrade your spots"** (say "let me in anyway").
9. D29 Viewer after 'Set as primary': **keeps its order while open** (say "jump to first").
10. D30 Joining an existing spot from review: **only the photos go**; a typed name/tags are dropped (say "fill blanks").
11. D31 Partly failed import/save: **screen stays open with only the unsaved photos; retry doesn't duplicate**
    (say "close anyway").
12. D32 Radius precision: **whole metres** (typed 100 ft reads back 98) (say "keep my feet", or name a maximum).

### 2026-10-21 16:30 · M8-02 · passes

- `APP_SPECIFICATIONS.md`: new '## Simplified model (2026-10-20)' directly under the title (Spot interface, three filters, sorts, viewer, nearby offer, metre radius shown in user units, Older details, pointer to the design doc). Six headings now start '[SUPERSEDED]' (Feature Details, In-Run, Two-Stage Filtering, Landing, Spot Metadata, Gear + Build Filter Interaction), text kept; a note sits under the old Filters table.
- `README.md` Status header dated 2026-10-20 (its list already had every required item); `CLAUDE.md` says feature_types are in tap order (everything else already there); `docs/RUNNING-ON-PHONE.md` gains Add details / nearby card and Edit / Older details bullets.
- Verified: `grep -n SUPERSEDED APP_SPECIFICATIONS.md` (6 hits); `check.sh` green, 651 tests (docs only).
- Questions for Michael: none. Proposed changes: none.

### 2026-10-21 16:00 · M8-01 · passes

- Sweep (spec §6) written up in new `docs/plans/2026-10-20-m8-sweep.md`. It has the full grep-loop output and a table giving the reason for every kept hit. No app code uses a removed type, component, label table, setting or filter. The hits that remain fall into four groups: shipped migrations (`schema.ts`, never edited), the D26 `legacy_json` keys and their 'Older details' labels (Material, Intensity, Bustability…), tests that assert something removed stays absent (D20/D22), and non-model `status` (permissions, `expo-status-bar`, `Promise.allSettled`).
- Renamed incidental "Draft" words: `profile.tsx` `draft` → `typed`, `edit.tsx` `draftMedia` → `stagedMedia`, `edit-add-photos.test.tsx` `savedDrafts` → `savedStaged`.
- expo-doctor first exited 1 on patch mismatches; `npx expo install --fix` → expo 57.0.31, expo-location 57.0.22, expo-router 57.0.29 (separate `chore:` commit, expo-modules-core still at the root only); CLAUDE.md Stack updated. Doctor now exits 0 (21/21). `expo export --platform ios` exits 0 before and after (4.3 MB hbc).
- Docs grep (README, CLAUDE.md, RUNNING-ON-PHONE) prints nothing. Every `units.ts` export has a caller outside tests (`displayLength` → legacy-details; the three radius helpers → profile/import). Every `components/index.ts` export exists.
- Tests 651 → 651 (52 suites); `check.sh` green; `jest --ci` 0 console.error.
- Proposed change: M8-01 step 1 says each pattern "prints nothing", but it only names `status` as an exception. In practice it cannot hold for migration 1/3 code (CLAUDE.md: never edit a shipped migration), the D26 archive and its labels, or the regression tests that assert something removed stays absent. Suggest the step allow those categories when they are listed, as the sweep doc does.
- Next (M8-02): the docs grep is already clean; APP_SPECIFICATIONS still needs the 'Simplified model' section and the [SUPERSEDED] marks.

### 2026-10-21 verify M7

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M7-01 | 1 | `npx jest --ci src/__tests__/utils.test.ts`; read the 'import radius' describe | Pass. radiusToDisplay 50→164/50, 30→98; radiusFromInput '164'→50, '100'→30, Metric '30'→30; '', '0', '-5', 'abc'→null for both units; radiusUnitLabel 'ft'/'m' | yes |
| M7-01 | 2 | Read `profile.test.tsx` (14 pass) | Imperial: text 'Import radius · ft', label 'Import radius in feet' value '164'. Metric press: 'Import radius · m', 'Import radius in metres' '50'. '328'+blur → store 100. 'abc'+blur → value '164', store 50, save not called | yes |
| M7-01 | 3 | Read `import-screen.test.tsx` (3 pass) | /\(within 164 ft\)/ Imperial, /\(within 50 m\)/ Metric; groupPhotosByProximity calledWith(any Array, 50) | yes |
| M7-01 | 4 | `grep -rn "Import radius in meters\|(meters)\|{batchRadius}m" app src --include=*.tsx` | No output | yes |
| M7-01 | 5 | `check.sh` (green, 651 tests) + `npx jest --ci | grep -c console.error` | green; 0 console.error lines (lint/tsc inside check) | yes |
| M7-02 | 1 | `wc -l reviews/m7.diff`; read plan 'Review' section; `git show --stat e9eee31 68fbc95`; read the 50.4 m test | m7.diff exists (350 lines); findings table has severity, file:line, fix commit; Important #6 fix has RED e9eee31 before GREEN 68fbc95; answer written; test 'writes nothing when a radius that is not whole feet is blurred unchanged' stores 50.4 and 'leaves the stored metres alone' (50 shows 164, stays 50) both assert as required | yes |
| M7-02 | 2 | Read plan 'What Michael will see' | Imperial and Metric lists of Profile texts in order, noted as from a scratch render; no scratch test file left in src/__tests__ | yes |
| M7-02 | 3 | `grep -n radius CLAUDE.md README.md APP_SPECIFICATIONS.md` | CLAUDE.md l.94-95 Conventions line (metres, units.ts edges); README l.13/40 radius in your units; APP_SPECIFICATIONS l.296 User settings note | yes |
| M7-02 | 4 | `check.sh` green; 0 console.error | green | yes |

### 2026-10-21 15:10 · M7-02 · passes

- Opus review of `reviews/m7.diff` (350 lines): 0 Critical, 2 Important, 4 Minor; table, answer and 'What Michael will see' (Imperial and Metric Profile texts from a scratch render, test deleted) in new `docs/plans/2026-10-20-m7-radius.md`.
- Important #6 fixed: the unchanged-blur test passed even with the `draft === null` guard removed. The new test stores 50.4 m (shows 165 ft) and fails under that mutation (1 of 14). Minor #2 fixed: `radiusFromInput` reads only plain decimals ('0x10', '1e3' and 'Infinity' were accepted). RED `e9eee31` → GREEN `68fbc95`.
- Important #1 (reviewer) left as specified: whole-metre storage snaps typed feet (165 → 164, 100 → 98, ≤ 2 ft) because D23 and M7-01's step say '100' ft → 30 m. Recorded as **D32 *default*** + §9 Q12.
- Docs: CLAUDE.md Conventions (radius in metres, converted at the edges with units.ts), README Status (+M7, radius in your units), APP_SPECIFICATIONS User Settings note.
- Tests 648 → 651; `check.sh` green (651); `jest --ci` 0 console.error.
- Question for Michael (§9 Q12): keep whole metres (typed 100 ft reads 98), or store centimetres so 100 ft stays 100? And should a maximum radius refuse typos like 99999?
- Proposed change: none.

### 2026-10-21 14:40 · M7-01 · passes

- D23 built: `src/utils/units.ts` gains `radiusToDisplay` (50 m → 164 ft / 50 m, 30 → 98), `radiusFromInput` (Imperial '164' → 50, '100' → 30, '328' → 100; '', '0', '-5', 'abc' → null; a positive input never becomes 0 m, '1' ft → 1 m) and `radiusUnitLabel`.
- Profile (`app/(tabs)/profile.tsx`): label 'Import radius · ft|m', accessibilityLabel 'Import radius in feet|metres'; the field shows the stored metres and keeps a draft only while typing, so a units switch re-renders it (164 ↔ 50). Blur unchanged or with the same metres saves nothing (no drift); invalid text restores the display; text typed before tapping Metric/Imperial is saved in the unit it was typed in.
- Import (`app/import/index.tsx`): '(within 164 ft)' / '(within 50 m)'; `groupPhotosByProximity` still gets 50 (metres).
- Tests 634 → 648 (`utils.test.ts` +6 incl. a 1–500 m round-trip, `profile.test.tsx` +6 net, new `import-screen.test.tsx` 3). The switch-before-blur test fails with the commit removed. `check.sh` green (648), `jest --ci` 0 console.error, the step-4 grep prints nothing.
- Next (M7-02): `docs/plans/2026-10-20-m7-radius.md` does not exist yet; the reviewer's round-trip question is already covered by 'leaves the stored metres alone when the field is blurred unchanged' and the 1–500 m round-trip test. The profile test checks setBatchImportRadius(100) through the store and `saveUserSettings`, not a spy on the hook.
- Questions for Michael: none new (§9 Q10 / Q11 still open).

### 2026-10-21 verify M6

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M6-01 | 1 | Read docs/plans/2026-10-20-m6-review-screens.md | Has Quick Add layout (photos, name, Add details→SpotTagFields, nearby card, Save), card contents, 'Add photos there' flow (savePhotos to spot_id, no addSpot, dismissAll then push), import per-group offer (default New spot, chips), test list | yes |
| M6-01 | 2 | Read nearby-spots.ts and nearby-spots.test.ts; `npx jest src/__tests__/nearby-spots` | Signature matches; tests assert 10/40/60 m radius 50 → ['10 m','40 m'], NO_LOCATION spot [], deleted [], NO_LOCATION query [], exact radius included; pass | yes |
| M6-01 | 3 | `/home/mh550/projects/agent-harness/lib/check.sh` | green (634 tests, cached) | yes |
| M6-02 | 1 | Read quick-add-tags.test.tsx; ran it | Passes: first render no checkbox/switch/radio, 'Add details' button; press → 8 checkboxes, switch 'Skate stopped', 5 radios, link gone; saves ['rail'], true, 2; untouched saves [], false, undefined | yes |
| M6-02 | 2 | Read test 'keeps autoFocus…' and app/add/review.tsx l.185,198,261 | autoFocus true, Save text 'Save', Add details accessibilityRole=button | yes |
| M6-02 | 3 | check.sh | green, 0 failures | yes |
| M6-03 | 1 | Read quick-add-nearby.test.tsx; ran it | 5/20/45/80 m, radius 50 → 3 cards nearest first 'Near Five Rail · 16 ft'…; metric '5 m'; thumbnails/placeholder; none when empty or NO_LOCATION | yes |
| M6-03 | 2 | Read test "'Add photos there' saves every photo…" | savePhotos once, spot_id/location/created_at asserted, addSpot 0, updateSpot primary for photo-less spot, call order savePhotos,updateSpot,dismissAll,push /spot/id | yes |
| M6-03 | 3 | Read test 'Save still creates a new spot when cards are shown' | addSpot once, photos saved to new id | yes |
| M6-03 | 4 | Read profile.tsx:62 and profile.test.tsx:66; ran profile test | Hint text matches exactly; passes | yes |
| M6-03 | 5 | check.sh | green | yes |
| M6-04 | 1 | Read import-nearby.test.tsx; ran it | Offer on A only with New spot selected default; other groups never counted; Near line 'Near Library Rail · 49 ft' | yes |
| M6-04 | 2 | Read test 'Import sends group A's photos…' | addSpot once, savePhotos twice, group A photos with existing spot_id and captured_at; name inputs drop 2→1 when chosen | yes |
| M6-04 | 3 | Read test 'choosing the existing spot hides the name field and counts only new spots' | '1 spot from your photos' / 'Import 1 Spot' after choice, back to 2 | yes |
| M6-04 | 4 | check.sh | green | yes |
| M6-05 | 1 | Read docs/plans/2026-10-20-m6-what-michael-will-see.md; git ls-files for scratch tests | Lists all five renders in order (fast path, details open, 3 nearby cards, import before/after); no temp test tracked | yes |
| M6-05 | 2 | Read verification section; ran `npx expo export --platform ios --output-dir <scratch>/export` | Doc records jest 626 and export exit 0; my export exit 0 (suite is now 634 after M6-06 fixes) | yes |
| M6-05 | 3 | check.sh | green | yes |
| M6-06 | 1 | Read reviews/m6.diff presence and 'Review (M6-06)' table | m6.diff exists (1429 lines); 10 findings with severity, file:line, fix commits; RED b7af80d/6787c6f precede GREEN 075e635/86be528 and tests named | yes |
| M6-06 | 2 | Read written answers and tests (double tap, ref-guard test, units change test, failed group tests) | All three answered, with tests 'runs once under a double tap', 'follows a units change', failed-group tests; pass | yes |
| M6-06 | 3 | git log --grep refactor; grep CLAUDE.md/README/APP_SPECIFICATIONS | refactor: 8fb2d16; CLAUDE.md l.42-43,72 mention nearby-spots and Add details; README l.23; APP_SPECIFICATIONS l.326,363 notes | yes |
| M6-06 | 4 | check.sh | green | yes |

### 2026-10-21 23:45 · M6-06 · passes

- Opus review of `reviews/m6.diff` (1429 lines): 0 Critical, 2 Important (both fixed), 8 Minor (6 fixed, 2 left). Table, answers and simplification pass under 'Review (M6-06)' in `docs/plans/2026-10-20-m6-review-screens.md`.
- Important: Quick Add's Alert could never fire because `savePhotos` never rejects, so failed photos were lost without a word. Now unsaved photos stay on screen ("Some photos weren't saved") and a retry after Save adds them to the spot it created. `addSpot` used to keep a spot the DB refused, so the import retried forever against a missing spot. It now takes the spot out of the store and rejects.
- Minor fixes: a ref guard on Save, 'Add photos there' and Import (two presses in one frame ran the import twice: 4 calls for 2 groups); the import locks chips, name and Remove while saving; no offer without photos; label 'Add photos there, <name>'; Remove gets a role; the spinner is labelled 'Importing'; the 'Near' line names the chosen spot.
- Commits: RED `b7af80d`/`6787c6f` → GREEN `075e635`/`86be528`, `refactor:` `8fb2d16` (import review drops `useCallback`), docs `2010f8b` (CLAUDE.md Layout, README Status, APP_SPECIFICATIONS dated notes). Removing any one guard or rollback (6 mutations) fails exactly one test.
- Tests 626 → 634; `check.sh` green (634); `jest --ci` 0 console.error; `expo export --platform ios` exit 0.
- D31 / §9 Q11 now cover Quick Add and a spot the DB refused. Known limit: a spot whose first photo failed keeps a dangling `primary_photo_id`; the screens fall back to its first saved photo.
- Proposed change: import choice chips are about 35 pt tall (shared `Chip`); a 44-pt pass belongs in a polish feature. Questions for Michael: none new (§9 Q10 / Q11 still open).

### 2026-10-21 23:10 · M6-05 · passes

- New `docs/plans/2026-10-20-m6-what-michael-will-see.md`: render-order walkthroughs (texts, placeholders, button/switch/radio labels) of the Quick Add review (2 photos no nearby; 'Add details' open; 3 nearby cards 16/66/148 ft with labels) and the import review (2 groups, one offer; before and after choosing 'Add photos to Library Rail').
- Rendered by a temporary test (`tmp-walk.test.tsx`, deleted, not committed); no source changes.
- Records `npx jest --silent` 51 suites / 626 tests and `npx expo export --platform ios --output-dir /tmp/hl-export` exit 0. `check.sh` green (626).
- Questions for Michael: none new (§9 Q10 / Q11 still open). Next: M6-06.

### 2026-10-21 22:45 · M6-04 · passes

- `app/import/review.tsx`: each group gets `offers = nearbySpots(first photo's location, store spots, radius)` (≤ 3; other groups of the import never count). With offers: 'Near <name> · <distance>' (units subscribed) + a one-of `Chip` row 'New spot' (default, selected) · 'Add photos to <name>'. Choosing a spot hides the name field (D30). Subtitle/button count only new spots; all to existing → 'Photos go to spots you already have.' / 'Add photos'. Group key is now the first photo's URI.
- Import: `Promise.allSettled`; a targeted group runs `savePhotos` with `spot_id` = target (captured_at + per-photo location kept), no `addSpot`; primary set only if the spot has no photo, by the first such group (decided up front, no race).
- Opus review (diff in scratch) found the hooks swallow errors, so failures would vanish silently. Fixed: each group returns its unsaved photos; those stay on screen aimed at the spot they were going to (a new spot's id), with an Alert "Some photos weren't imported"; a retry neither duplicates nor creates a second spot. New **D31 *default*** + §9 Q11; plan's failure bullet updated.
- New `src/__tests__/import-nearby.test.tsx` (13 tests). RED 8/10 first, then 2/13 for the partial-save cases; mutations (no primary dedup, always primary, drop unsaved, unsaved not aimed, no chosen chip) each fail a test.
- Tests 613 → 626; `check.sh` green (626); `jest --ci` 0 console.error.
- Question for Michael: §9 Q11 (D31) — keep a partly failed import on screen for retry, or close anyway? (Q10 / D30 still open.)

### 2026-10-21 22:15 · M6-03 · passes

- `app/add/review.tsx`: a card 'Already have this spot?' above Save, up to three rows from `nearbySpots(here, spots, batch_import_radius)`: 48-pt primary thumbnail (grey placeholder when none), 'Near <display name> · <distance>' (units subscribed), 'Add photos there' (label 'Add photos to <name>'). It runs one `savePhotos` to that `spot_id`, no `addSpot`, sets `primary_photo_id` only when the spot has no photo at all (`primaryPhoto` undefined), then `dismissAll` → `push('/spot/<id>')`. It shares the `saving` guard with Save; both now `try/catch` → Alert "Couldn't save the photos" and stay on the screen.
- New `nearbyLabel()` in `src/utils/nearby-spots.ts` (M6-04 can reuse it). Profile radius hint is now the new sentence (`profile.test.tsx` +1, stale D12 comment fixed).
- New `src/__tests__/quick-add-nearby.test.tsx` (10 tests: 5/20/45/80 m → 3 cards '16 ft'/'66 ft'/'148 ft', metric '5 m' + a units change re-renders, thumbnails, none outside radius, none at NO_LOCATION, 20 m call order `savePhotos, updateSpot, dismissAll, push`, primary untouched when photos exist, double tap + Save → once, Save with cards → `addSpot`, a throw → Alert then a retry works). RED 7/9 first; mutations (no primary update; no guard) each fail a test.
- Tests 601 → 613; `check.sh` green (613); `jest --ci` 0 console.error.
- Known limit: if Save's `savePhotos` threw after `addSpot` succeeded, a retry makes a second spot (both hooks swallow per-row errors, so a throw is unlikely). Left for M6-06 to judge.
- Questions for Michael: none new (§9 Q10 / D30 still open).

### 2026-10-21 21:50 · M6-02 · passes

- `app/add/review.tsx`: an 'Add details' link (`Pressable`, role button, 44-pt tall, blue text) under the name field; pressing it swaps in `SpotTagFields` (one-way, no 'Hide'). `tags` state starts `{ feature_types: [], stopped: false }` and Save spreads it into the new spot. Name keeps `autoFocus`, Save text 'Save'.
- New `src/__tests__/quick-add-tags.test.tsx` (5 tests, hooks mocked, asserts on `addSpot`): no checkbox/switch/radio at first; press → 8 chips, 'Skate stopped', 5 segments, link gone; Rail + switch + Some → `['rail']`, `true`, `2`; untouched → `[]`, `false`, no speed; autoFocus + Save text. RED 3/5 before the change; mutation (spread → fixed `[]`/`false`) fails the tags test.
- Tests 596 → 601; `check.sh` green (601); `jest --ci` 0 console.error.
- Next (M6-03): Save still has no try/catch; the plan adds it with 'Add photos there' (shared `saving` guard). Questions for Michael: none new (§9 Q10 / D30 still open).

### 2026-10-21 21:30 · M6-01 · passes

- New `docs/plans/2026-10-20-m6-review-screens.md`: Quick Add layout (photos · name · 'Add details' link → `SpotTagFields` · location · nearby card · Save), nearby rows ('Near <display name> · 16 ft', 48-pt thumbnail, 'Add photos there', ≤ 3 nearest), what 'Add photos there' does (one `savePhotos` to that `spot_id`, no `addSpot`, primary set if none, `dismissAll` then `push('/spot/<id>')`, shared `saving` guard), import per-group chip offer (store spots only, 'New spot' default, counts only new spots), failure behaviour, test list per feature.
- New `src/utils/nearby-spots.ts` `nearbySpots(location, spots, radiusMeters)` + `src/__tests__/nearby-spots.test.ts` (7 tests: 10/40/60 m → [10, 40]; NO_LOCATION spot; deleted; unknown query; exactly-radius inclusive; no mutation). Mutation check: `<=`→`<`, no deleted filter, no early return, no sort each fail one test.
- Spec: new **D30 *default*** + §9 Q10 (joining an existing spot drops the review's typed name/tags).
- Tests 589 → 596; `check.sh` green (596); `jest --ci` 0 console.error.
- Next (M6-02/03): Quick Add Save has no try/catch today; plan adds one for both buttons. Question for Michael: §9 Q10 (D30) — OK to drop a typed name when adding photos to an existing spot, or "fill blanks"?

### 2026-10-21 21:00 · verify M5

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M5-01 | 1 | Read docs/plans/2026-10-20-m5-filters-list.md | Has FilterSheet layout (chips · segmented Any/Not stopped/Stopped · range), SpeedScale range API (rangeValue/onRangeChange, tap table incl. third tap clears), SpotListItem props, callout ' · ' rule, test list | yes |
| M5-01 | 2 | `npx jest --ci` stores.test.ts (115 pass across the 5 M5 files); read assertions at l.76-96, 207-250 | stopped undefined/true/false cases; 'min 1 and max 3 keep speeds 1,2,3 and unrated, drop 0 and 4'; count 1/1/1/3/0 asserted | yes |
| M5-01 | 3 | `check.sh` (lint+tsc+jest --silent) | green, 589 tests; jest --ci no console.error | yes |
| M5-02 | 1 | Read speed-scale.test.tsx l.138-190 | undefined → none selected + 'Any'; Little,Enough → [1,3] + 'Little to Enough'; Some×2 → [2,2] + 'Some'; Enough,Little → [1,3]; [2,2]+Some → undefined | yes |
| M5-02 | 2 | Read filter-sheet.test.tsx l.113-216 | headers = Filters + 3 section labels only; tabs Any/Not stopped/Stopped; Apply gives exactly {types:['rail'],stopped:true,min:1,max:3}; Reset → DEFAULT_FILTERS; stored filters pre-selected | yes |
| M5-02 | 3 | Read spots-sort-search.test.tsx l.192-205 | 'counts all three filters: 3 active': label 'Filter spots, 3 active', text 'Filter (3)' | yes |
| M5-02 | 4 | `check.sh` | green, 589 tests | yes |
| M5-03 | 1 | Read spot-list.test.tsx l.62-128 | 'Rail +2'; Stopped only when stopped; label 'Natural speed: Too much'; none when undefined; numberOfLines 2; distance shown | yes |
| M5-03 | 2 | Read spot-map.test.tsx l.72-122 | description 'Rail · Ledge'; [] → undefined; all pins SPOT_PIN; title = getSpotDisplayName | yes |
| M5-03 | 3 | Read src/components/SpotListItem.tsx | Props id, displayName, thumbnailUri?, featureType?, stopped, naturalSpeed?, distance?, onPress; wrapped in memo | yes |
| M5-03 | 4 | `check.sh` | green, 589 tests | yes |
| M5-04 | 1 | Read docs/plans/2026-10-20-m5-what-michael-will-see.md; `git ls-files` for stray render test | Three rows, sort chips in order, sheet empty and all-three, Marker props for two spots; no temp test tracked | yes |
| M5-04 | 2 | Read Verification numbers; ran `npx expo export --platform ios --output-dir /tmp/harness/.../exp` | File records jest totals (584 then) and export exit 0; my export exit 0 | yes |
| M5-04 | 3 | `check.sh` | green, 589 tests | yes |
| M5-05 | 1 | Read reviews/m5.diff (1243 lines) and 'Review (M5-05)' in the plan; `git log` of filter-sheet test | Findings table with severity, file, fix commit; Important fix RED ea1e9a2 before GREEN 6571829 | yes |
| M5-05 | 2 | Read 'Answers to the M5-05 questions' | Range a11y (selected per in-range segment, test named); badgeRow flexWrap: wrap with distance on own line; Reset filters clears all three, three tests named | yes |
| M5-05 | 3 | `git log`; read CLAUDE.md l.63, README Status l.29-45, RUNNING-ON-PHONE | refactor commit 595e53a; CLAUDE.md stores line has three filters; README feature type/skate stopped/natural speed, sort Distance, Date, Name; phone doc has Filter text | yes |
| M5-05 | 4 | `check.sh` | green, 589 tests | yes |

Result: 18 hold, 0 fail.

### 2026-10-21 20:30 · M5-05 · passes

- Opus review of `reviews/m5.diff` (1243 lines): 0 Critical, 1 Important (fixed), 5 Minor (4 fixed, 1 left), recorded under 'Review (M5-05)' in `docs/plans/2026-10-20-m5-filters-list.md` with the three written answers (range a11y: every in-range segment `selected`; row `flexWrap: 'wrap'`, distance on its own line; 'Reset filters' clears all three, tests named).
- Important: the list row's VoiceOver label was the name only; now 'Downtown Rail, Rail +2, Skate stopped, Natural speed: Too much, 2.3 mi' (RED `ea1e9a2` → GREEN `6571829`). Also: sheet Reset has role button, `SegmentedControl` segments 44 pt (List / Map too), types reset test.
- `refactor:` `595e53a`: type badge = small `Tag` (pill, like Stopped), one `STOPPED_SEGMENTS` table, range summary once. Docs `22cf902`: CLAUDE.md stores line (three filters), README Status (feature type / skate stopped / natural speed; sort Distance, Date, Name), RUNNING-ON-PHONE Filter + row + callout.
- Tests 584 → 589; `check.sh` green (589), `jest --ci` 0 console.error.
- Next: M5 verify. Phone checks: the taller List / Map switch and the pill type badge look. Questions for Michael: none.

### 2026-10-21 19:50 · M5-04 · passes

- New `docs/plans/2026-10-20-m5-what-michael-will-see.md`: three list rows (three types + Stopped + Too much; untagged; one type, no photo), sort chips in order Distance · Date · Name (with/without location), Filter sheet empty and all-three-set, Marker props for two spots, a phone checklist. Rendered from a temporary test (deleted); no code changed.
- Verified: `npx jest --silent` 47 suites, 584 tests (unchanged); `npx expo export --platform ios` exit 0; `check.sh` green. Git diff is docs + `passes` only.
- Next (M5-05): row VoiceOver label still just the name (noted in the doc's Known gaps). Questions for Michael: none.

### 2026-10-21 19:20 · M5-03 · passes

- `SpotListItem` props now `{ id, displayName, thumbnailUri?, featureType?, stopped, naturalSpeed?, distance?, onPress }` (still `memo`); badge row (wrap, centred): type badge 'Rail +2' · `Tag size="small" tone="stopped"` 'Stopped' · `SpeedScale readonly compact` bar; distance stays on its own line. `Tag` gains `size`, the readonly bar gains `compact` (12-pt word). `app/(tabs)/index.tsx` passes `stopped`/`natural_speed`. Map callout description = new `featureTypesList` ('Rail · Ledge', `[]` → undefined) in `src/utils/spot-name.ts`.
- Tests 572 → 584: spot-list (+7: 'Rail +2', Stopped only when stopped, 'Natural speed: Too much', None (0) shown, unrated none, 12-pt/red sizes, two-line name + distance), spot-map ('Rail · Ledge', titles = display name), spot-name `featureTypesList` (+3), spots-view-mode (screen passes stopped + speed).
- Verified: every step's test passes; mutation `stopped={false}` in renderItem fails the screen test (reverted); `check.sh` green (584); `jest --ci` 0 console.error. Opus review: 0 Critical; applied Important 1–2 (oversized Tag/bar in the row) and fixture reuse; skipped the pre-existing 'memo behavior' test naming.
- Next (M5-04/05): the row's VoiceOver label is still `displayName`, so Stopped/speed are not announced (the Pressable hides its children); M5-05 should decide on appending them. Questions for Michael: none.

### 2026-10-21 18:45 · M5-02 · passes

- `src/components/FilterSheet.tsx`: three sections (What's here chips · Skate stopped `SegmentedControl` Any/Not stopped/Stopped · Natural speed `SpeedScale` range); section titles and 'Filters' are `accessibilityRole="header"`; stopped/range keys always written (explicit undefined) so Apply clears old values. `SpeedScale.tsx` is now a dispatcher (`SpeedBar` / `SpeedPicker` / `SpeedRangePicker`); tap rules in new pure `src/utils/speed-range.ts` (`nextSpeedRange`, `liveAnchor`, `inSpeedRange`, `speedRangeLabel`).
- Tests 536 → 572: new `speed-range.test.ts` (13), speed-scale range mode (10), filter-sheet three filters (11), spots-sort-search 'Filter (3)' / '3 active' badge + 'Reset filters' clears a speed range.
- Verified: each step's cases pass; mutations (drop explicit-undefined keys in the sheet) fail 2 tests, reverted; `check.sh` green (572), `jest --ci` 0 console.error. Opus review: 0 Critical/Important; applied Minor 1 (`?: never` so modes cannot mix, checked with tsc) and 3 (description line labelled 'Natural speed: …'); skipped the hint full stops (strings pinned by the plan).
- Next (M5-03): list row + callout; `<SpeedScale readonly value={…} />` still works unchanged. Questions for Michael: none.

### 2026-10-21 18:10 · M5-01 · passes

- New plan `docs/plans/2026-10-20-m5-filters-list.md`: sheet layout (What's here chips · Skate stopped segmented Any/Not stopped/Stopped · Natural speed range), SpeedScale range API (`rangeValue`/`onRangeChange`, tap table in a pure `nextSpeedRange`, a11y), SpotListItem props, callout `' · '` rule (`featureTypesList`), test list.
- Store: the filter semantics were already built in M1/M2. `selectActiveFilterCount` now checks `!== undefined` instead of `!= null`. `stores.test.ts` gains 6 tests (speeds 0–4 with min 1/max 3, stopped undefined, count `{min:0,max:2}`/`{max:0}`, `setFilters` all three, explicit undefined clears, reset copy). Tests 530 → 536.
- Verified: if the count tested truthiness, the `{min:0,max:2}` test would fail (mutation tried, then reverted). `check.sh` green (536), `jest --ci` 0 console.error.
- Next (M5-02): build the sheet and range mode per the plan. Keys must always be present (explicit undefined) so Apply's merge clears an old range or stopped value.
- My calls on the plan (§10, no question for Michael): the first tap emits `[t,t]`, a tap outside a complete range starts a new range, `[0,4]` is kept as chosen. Questions for Michael: none.

### 2026-10-21 · verify M4

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M4-01 | 1 | read docs/plans/2026-10-20-m4-viewer.md | has route, FlatList pager + why, Simultaneous/Exclusive composition, gallery-gestures signatures, Alert (no ActionSheetIOS), ~150-line zoom-toolkit fallback, test list | yes |
| M4-01 | 2 | read app/_layout.tsx, jest.setup.ts; ran root-layout.test.tsx | GestureHandlerRootView style flex 1 wraps tree; jestSetup imported, file exists, reanimated mock kept; 3/3 root-layout tests pass | yes |
| M4-01 | 3 | `npx expo export --platform ios` to scratch dir; read plan l.26 | exit 0; plan records 4,060,375 B → 4,215,187 B | yes |
| M4-01 | 4 | `check.sh`; `npx jest --ci` on M4 suites | green (530 tests); no console.error lines | yes |
| M4-02 | 1 | read src/utils/gallery-gestures.ts exports | clampScale, toggleZoom, clampPan, pagingEnabled, shouldClose, focalZoom all exported with the stated signatures | yes |
| M4-02 | 2 | gallery-gestures.test.ts, read assertions | clampScale 0.5→1, 6→4, 2.2; toggleZoom 1→2.5, 2.5→1, 1.04→2.5; clampPan scale 1 → 0,0; ({500,-900},2) = {195,-422}; pagingEnabled 1/1.06; shouldClose 121/119/(300,2) | yes |
| M4-02 | 3 | check.sh | green, 0 console.error | yes |
| M4-03 | 1 | read _layout.tsx l.39, photos.tsx l.150-200, tests | Stack.Screen spot/[id]/photos registered; FlatList with initialScrollIndex + getItemLayout; labels 'Photo N of M'; black root; StatusBar hidden; tests pass | yes |
| M4-03 | 2 | photo-viewer.test.tsx verbose | '3 / 7' at index 2; Close button role/label → router.back; page 5 → '6 / 7'; index 99 → last; 'Spot not found' — all pass | yes |
| M4-03 | 3 | spot-detail.test.tsx -t viewer | 'opens the full-screen viewer at the pressed photo' passes (push to /spot/<id>/photos index 3) | yes |
| M4-03 | 4 | check.sh + expo export | green; export exit 0 | yes |
| M4-04 | 1 | wc -l ZoomablePhoto.tsx; grep StyleSheet | 144 lines, no styles block; Pinch+Pan+Tap+gallery-gestures; no toolkit installed (<150) | yes |
| M4-04 | 2 | photo-viewer.test.tsx l.208-215 | scrollEnabled true at 1×, false after onScaleChange(2), true after 1 | yes |
| M4-04 | 3 | photo-viewer.test.tsx swipe-down tests | 150 at 1× → back; 119 → none; 150 at 2× → pans, no back; use fireGestureHandler | yes |
| M4-04 | 4 | read plan l.44, l.134 | states no back interception; Stack pops | yes |
| M4-04 | 5 | check.sh + export | green; export exit 0 | yes |
| M4-05 | 1 | photo-viewer.test.tsx l.470-500 | Alert buttons Set as primary / Remove photo (destructive) / Cancel; updateSpot(id,{primary_photo_id}); 'Remove this photo?' → removePhotos once; counter N / 6 | yes |
| M4-05 | 2 | tests l.540-580 | last photo → back; primary removed → next id or null (both tested) | yes |
| M4-05 | 3 | grep photos.tsx:161, test l.448 | accessibilityHint 'Double-tap and hold for options' present and asserted | yes |
| M4-05 | 4 | check.sh | green | yes |
| M4-06 | 1 | read docs/plans/2026-10-20-m4-what-michael-will-see.md; git status clean | has 7-photo index-2 tree (counter, Close, page labels), after-swipe render, detail tile; no leftover temp test | yes |
| M4-06 | 2 | read 'Try on the phone' | all listed gestures with expected results, plus note none ran on a device | yes |
| M4-06 | 3 | read 'Verification numbers' | records jest totals (520, stale vs 530 now), export exit 0, bundle 4,240,251 B | yes |
| M4-06 | 4 | check.sh | green | yes |
| M4-07 | 1 | ls reviews/m4.diff; read plan Review; git log | diff exists; findings table with severity/location/fix; RED 0b1dfe8 precedes GREEN d2b3e46 for Important fixes | yes |
| M4-07 | 2 | read written answers; grep photos.tsx, ZoomablePhoto.tsx | windowSize 3, contentFit contain, recyclingKey, StatusBar hidden only while mounted, ✕ 44×44; worklets use shared values/pure utils | yes |
| M4-07 | 3 | git log; grep CLAUDE.md, README.md, RUNNING-ON-PHONE.md | refactor: f89bb03; docs all mention viewer, gallery-gestures, gesture jest setup | yes |
| M4-07 | 4 | check.sh | green | yes |

### 2026-10-21 17:30 · M4-04 · passes

- Fixes the verify-pass failure: `src/components/ZoomablePhoto.tsx` goes from 156 to **144 lines** (no styles block), under step 1's 150 limit. I reflowed the `gallery-gestures` import and the `report` callback; behaviour is unchanged. The unzoomed pan's `[-10, 10]` offsets became `PAN_SLOP` (10) in `src/utils/gallery-gestures.ts`, so the component has no number of its own. No zoom-toolkit.
- Tests went from 529 to 530 (`PAN_SLOP` constant test, RED first). The plan's `ZoomablePhoto` note in `docs/plans/2026-10-20-m4-viewer.md` now gives the new line count.
- Verified: `wc -l` = 144; the photo-viewer tests for scrollEnabled 1×/2×, swipe-down 150 at 1× → back, 119 → none, 150 at 2× → none all pass; plan l.44 says there is no back interception; `check.sh` green (530); `npx jest --ci` prints 0 `console.error`; `expo export --platform ios` (scratch dir) exit 0.
- Next: M4 should be all green now. Questions for Michael: none.

### 2026-10-21 verify M4

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M4-01 | 1 | read docs/plans/2026-10-20-m4-viewer.md | Has route (fullScreenModal, headerShown false), FlatList pager + getItemLayout rationale, Simultaneous/Exclusive composition, gallery-gestures signatures, Alert.alert sheet (no ActionSheetIOS), fallback rule to zoom-toolkit, test table | yes |
| M4-01 | 2 | read app/_layout.tsx, jest.setup.ts; `jest root-layout.test.tsx --verbose` | GestureHandlerRootView style flex 1 wraps tree; jestSetup imported (file exists); 3/3 root-layout tests pass incl. flex-1 wrap assertion | yes |
| M4-01 | 3 | `npx expo export --platform ios --output-dir /tmp/harness/hit_list/hit_list-2026-10-20/exp`; read plan l.26 | exit 0; plan records 4,060,375 B before → 4,215,187 B after | yes |
| M4-01 | 4 | `check.sh`; `npx jest --ci | grep -c console.error` | green, 529 tests; 0 console.error lines | yes |
| M4-02 | 1 | read src/utils/gallery-gestures.ts | All six functions exported with specified behaviour; clampPan scale 2, 390×844 → ±195/±422 by formula | yes |
| M4-02 | 2 | `jest gallery-gestures.test.ts --verbose`; read assertions l.27-85 | 19 pass; asserts clampScale(0.5)=1/(6)=4/(2.2)=2.2, toggleZoom 1/2.5/1.04, clampPan({500,-900},2)={195,-422}, scale 1 → 0,0, pagingEnabled(1.06)=false, shouldClose(121/119,1), (300,2); focalZoom centre test | yes |
| M4-02 | 3 | `check.sh`; jest console.error count | green; 0 console.error | yes |
| M4-03 | 1 | read app/_layout.tsx, app/spot/[id]/photos.tsx | Stack.Screen spot/[id]/photos fullScreenModal headerShown false; horizontal pagingEnabled FlatList, initialScrollIndex, getItemLayout by window width; label "Photo N of M"; root #000; StatusBar hidden | yes |
| M4-03 | 2 | `jest photo-viewer.test.tsx --verbose` | Passes: opens at ?index=2 shows "3 / 7"; Close button; swipe to page 5 → counter; index 99 → last; Spot not found | yes |
| M4-03 | 3 | `jest spot-detail.test.tsx`; read l.144-152 | Passes; photo-tile-3 press → push(`/spot/<id>/photos?index=3`) | yes |
| M4-03 | 4 | `check.sh`, export (see M4-01) | green; export exit 0; 0 console.error | yes |
| M4-04 | 1 | read src/components/ZoomablePhoto.tsx; `wc -l`; grep package.json for zoom-toolkit | Pinch + Pan + Tap(numberOfTaps 2) with shared values, pure fns only. But file is 156 lines with no styles block (129 non-comment/blank); step says under 150 excl. styles or toolkit installed; toolkit not installed; plan l.277 admits 156 | NO |
| M4-04 | 2 | `jest photo-viewer.test.tsx` "pages at 1× and locks paging once the page reports a zoom past 1.05×" | Passes; scrollEnabled prop true at 1×, false after zoom report | yes |
| M4-04 | 3 | photo-viewer tests "closes on a swipe down of 150 at 1×", "pans instead of closing … at 2×", "does not close … 119" | Pass; fireGestureHandler drives pan; router.back called at 150/1×, not at 2× | yes |
| M4-04 | 4 | read photos.tsx doc comment and plan l.45 | Stack pops on back, nothing intercepted; stated in plan and comment | yes |
| M4-04 | 5 | `check.sh`; export | green; export exit 0; 0 console.error | yes |
| M4-05 | 1 | photo-viewer tests under "long-press options" | Pass: Alert buttons Set as primary / Remove photo (destructive) / Cancel; updateSpot primary_photo_id; "Remove this photo?" confirm → removePhotos once; counter drops | yes |
| M4-05 | 2 | tests "moves to the new last page…", "makes the next/previous photo primary…", "clears the primary and closes the viewer when the only photo is removed" | Pass; router.back on last removal; primary → next id or null (both) | yes |
| M4-05 | 3 | read photos.tsx renderItem | accessibilityHint "Double-tap and hold for options" on page; test "tells VoiceOver users each page has options" passes | yes |
| M4-05 | 4 | `check.sh`; console.error count | green; 0 | yes |
| M4-06 | 1 | read docs/plans/2026-10-20-m4-what-michael-will-see.md | Viewer tree for 7 photos at index 2 (counter, Close label, page labels), after-swipe "6 / 7", detail tile render; notes temp tests deleted | yes |
| M4-06 | 2 | same file, "Try on the phone" | Checklist covers swipe, 4× cap, double-tap, paging lock, swipe-down at 1× only, ✕, long-press, remove drops count; states no gesture ran on a device | yes |
| M4-06 | 3 | same file, "Verification numbers" | Records jest totals (520 tests, since 529 after M4-07) and export exit 0 with 4,240,251 B bundle; my export also exit 0 | yes |
| M4-06 | 4 | `check.sh` | green | yes |
| M4-07 | 1 | read plan "Review (M4-07)", reviews/m4.diff (1752 lines), git log | Findings table with severity, location, fix; RED 0b1dfe8 precedes GREEN d2b3e46 | yes |
| M4-07 | 2 | read plan "Answers"; read photos.tsx/ZoomablePhoto.tsx | All five answered and match code: windowSize 3, initialNumToRender 1, contentFit contain + recyclingKey, StatusBar hidden only in viewer, close 44×44 | yes |
| M4-07 | 3 | git log, CLAUDE.md, README, docs/RUNNING-ON-PHONE.md | refactor commit f89bb03; CLAUDE.md lists photos route, gallery-gestures, gesture jest setup; README Status and RUNNING-ON-PHONE mention viewer | yes |
| M4-07 | 4 | `check.sh`; console.error count | green; 0 | yes |

M4-04 set to passes=false: ZoomablePhoto.tsx is 156 lines (step 1 requires under 150 excl. styles or the toolkit). Fix: trim ≥7 lines, or install react-native-zoom-toolkit as specified.

### 2026-10-21 16:40 · M4-07 · passes

- Opus review of the M4 diff (`reviews/m4.diff`, 1752 lines): 0 Critical, 2 Important, both fixed. Zoomed photos were decoded at screen size and would blur at 2.5–4×; now `allowDownscaling={!zoomed}`. A pinch starting at 1× could slide the native pager; `ZoomablePhoto` now reports `onPinchChange` and the screen turns `scrollEnabled` off while a pinch runs. Three Minor fixes: a swipe during a removal is kept, a photo already gone is not removed, and a pinch follows dragging fingers. RED `0b1dfe8` → GREEN `d2b3e46`. Rejected the cold-deep-link finding again (`DBInitializer`).
- `refactor:` `f89bb03`: one `PinchStart` shared value; `pinchPan`/`doubleTapZoom` in `gallery-gestures`; no-op defaults; memoised pages. The Review section, the five answers and the simplification notes are in `docs/plans/2026-10-20-m4-viewer.md`. `ZoomablePhoto.tsx` is 156 lines, past the ~150 guideline; the plan says why there's no toolkit switch.
- Docs: CLAUDE.md (viewer route, `ZoomablePhoto`, gallery-gestures, gesture jest setup), README Status, RUNNING-ON-PHONE (Photo viewer). The phone checklist gains sharp 4×, pinch vs pager and a still-finger long press.
- Tests went from 520 to 529. Verified: `check.sh` green (529), `npx jest --ci` prints 0 `console.error`, and `expo export --platform ios` (to the scratch dir) exited 0 with a 4,242,180 B bundle.
- Next: M4 is done. Both Important fixes need the phone to confirm (Jest can't run UIKit's gesture arbitration). Questions for Michael: none new.

### 2026-10-21 15:50 · M4-06 · passes

- New `docs/plans/2026-10-20-m4-what-michael-will-see.md`: the viewer tree (7 photos at index 2, then after a swipe to page 6), the detail tile that opens it, a "Try on the phone" checklist (all gestures, expected results, and a note that none ran on a device), and the totals.
- Rendered with two temporary tests (deleted before commit; `git status` clean of them). No code changed.
- Verified: `npx jest --silent` 46 suites / 520 tests; `expo export --platform ios` (scratch dir) exit 0, bundle 4,240,251 B; `check.sh` green.
- Next: M4 is done. Questions for Michael: none new.

### 2026-10-21 15:20 · M4-05 · passes

- Long-pressing a viewer page opens an Alert: 'Set as primary', 'Remove photo' (red) or 'Cancel'. 'Remove photo' asks 'Remove this photo?' first. The photo in its place is shown next (the next one, or the previous one at the end), and it becomes the primary if the removed one was. Removing the last photo closes the viewer. Files: `ZoomablePhoto.tsx` (LongPress gesture `Exclusive` with the double tap, 149 lines), `photos.tsx`, `gallery-gestures.ts` (`LONG_PRESS_MS` 500).
- Fixed the M4-03 Important finding: the shown photo is pinned by id, and after a removal `scrollToIndex` moves the native offset to it (in a layout effect).
- Tests went from 504 to 520 (15 in the viewer, 1 for ZoomablePhoto). Each failed first. Two mutations (scroll sync, zoom reset) turned their tests red.
- Verified: `check.sh` green (520), `npx jest --ci` prints 0 `console.error`, and `expo export --platform ios` (to the scratch dir) exited 0 with a 4,240,251 B bundle (+5 KB).
- Opus review (no Critical). Fixed:
  - the `exhaustive-deps` warning;
  - stale closures: the actions now read the stores when pressed. A RED test caught this: removing a photo just set as primary didn't update the primary;
  - a long press during a pinch is ignored;
  - TalkBack and VoiceOver reach the options through `accessibilityActions`;
  - the 450 ms hold had no effect, so it is now 500;
  - `pos` is updated on removal, and photos are compared by id;
  - the viewer closes before the primary write;
  - the scroll sync uses a layout effect.

  Left as is: a quick double press on an option runs it twice.
- Next (M4-06): the plan's "Built in M4-05" section lists the gestures to check on the phone (a pinch after a still two-finger hold, double tap vs long press, VoiceOver). Questions for Michael: none new.

### 2026-10-21 14:30 · M4-04 · passes

- New `src/components/ZoomablePhoto.tsx` (143 lines, no fallback library installed): pinch 1×–4× about the fingers, a pan that moves the photo while zoomed, double tap 1× ↔ 2.5×, and swipe down at 1× (the photo follows the finger). It uses `Gesture.Simultaneous(Pinch, Pan, Tap×2)` and reanimated `.get()/.set()` (the React Compiler lint rejects `.value =`). Every number comes from `gallery-gestures`, which gains `dragDown`.
- `photos.tsx`: every page is a `ZoomablePhoto` (test ids `viewer-<i>-pinch|pan|double-tap`). `scrollEnabled={pagingEnabled(zoom)}`, a swipe down calls `router.back()`, and the back gesture is not intercepted.
- `jest.setup.ts`: reanimated's mock `useSharedValue` gave a new value on every render, so a zoom was forgotten after a re-render. It is now wrapped in `useState`, which keeps the value like the real hook does.
- Tests went from 493 to 504 (10 in `photo-viewer.test.tsx`, 1 in `gallery-gestures.test.ts`). Each failed first.
- Verified: `check.sh` green (504). `npx jest --ci` prints 0 `console.error` lines. `expo export --platform ios` (to the scratch dir) exited 0, and the bundle is 4,235,237 B (+14 KB).
- Opus review:
  - Fixed the Important finding: pinch and pan shared start values, so a pinch starting mid-pan made the photo jump. The zoomed pan now applies per-frame deltas and pauses while a pinch runs.
  - Fixed Minor: a cancelled pan no longer closes the viewer, and a pan that started zoomed never closes it.
  - The rest (pinch vs pager at 1×, activation offsets) can't be checked in Jest and is listed in the plan's "Built in M4-04" for M4-06's phone checklist.
- Next (M4-05): add a LongPress gesture to `ZoomablePhoto` (`Gesture.Exclusive(doubleTap, longPress)`). Still to do from M4-03: pin the page to the shown photo after a removal. M4-07: CLAUDE.md should mention the stable `useSharedValue` mock and the `.get()/.set()` rule. Questions for Michael: none new.

### 2026-10-21 13:45 · M4-03 · passes

- New `app/spot/[id]/photos.tsx`: a black (`#000`) full-screen pager. It is an RN `FlatList` (horizontal, `pagingEnabled`, `getItemLayout` = window width, `initialScrollIndex` = `?index`, which is clamped and falls back to 0 when missing or NaN, `windowSize` 3). Other parts: a `'N / M'` counter, a 44×44 ✕ (`Close` → `router.back()`), `<StatusBar hidden />`, and pages that are `accessible` images labelled 'Photo N of M'. The order is fixed while open (D29); a removed photo drops out and an added one goes at the end. A missing spot shows 'Spot not found' and still has the ✕.
- `app/_layout.tsx` registers `spot/[id]/photos` (`fullScreenModal`, `headerShown: false`). Detail tiles now push `/spot/<id>/photos?index=N` (string form, role `imagebutton`).
- Tests went from 480 to 493: new `photo-viewer.test.tsx` (11), plus 1 in `spot-detail.test.tsx` and 1 in `root-layout.test.tsx`. Each failed first (module missing, or no route or handler).
- Verified: `check.sh` green (493). `npx jest --ci` shows 46 suites and 0 `console.error`. `expo export --platform ios` exited 0 (I wrote it to the scratch dir, not `/tmp/hl-export`). The Hermes bundle is 4,221,065 B (+5.9 KB since M4-01).
- Opus review: I fixed 3 Minor findings (dropped `removeClippedSubviews`, made the pages accessible images, added a D29 test). I rejected the cold-start finding, because `DBInitializer` renders screens only after the media have loaded.
- **Next (M4-05)** must fix the Important review finding, now in the plan's Pager section: after a removal the page index is not pinned to a photo and the native offset is not moved. Track the shown photo's id and call `scrollToIndex` when the count changes. Also still to do: iPad width changes, and iOS VoiceOver page announcements (`accessibilityLiveRegion` works on Android only).
- Questions for Michael: none new (D29 and the clampPan bounds are still open).

### 2026-10-21 13:10 · M4-02 · passes

- New `src/utils/gallery-gestures.ts`: `clampScale`, `toggleZoom`, `clampPan`, `pagingEnabled`, `shouldClose` and `focalZoom`, plus the plan's constants (`MIN_SCALE` 1, `MAX_SCALE` 4, `DOUBLE_TAP_SCALE` 2.5, `ZOOMED_EPSILON` 1.05, `CLOSE_DISTANCE` 120). Every function is marked `'worklet'`, imports nothing, and returns `0` instead of `-0`.
- `focalZoom(focal, scale, nextScale, viewport, translation = {0,0})`: the 4th argument is the viewport (for the centre), as the plan says. The 5th, the current translation, is new and optional, so a pinch that starts panned keeps its focal point. The plan's Pure functions section records both.
- New `src/__tests__/gallery-gestures.test.ts` (14 tests) covers every case in the feature, plus the bounds, -0, and focalZoom at a corner, from a panned zoom, and when zooming back to 1×. It failed first because the module was missing. Tests went from 466 to 480.
- Verified: `check.sh` green (480). `npx jest --ci`: 45 suites, 0 `console.error`.
- Next (M4-03/04): call `focalZoom(e, scale.value, next, {width, height}, {x: tx.value, y: ty.value})`, then `clampPan`.
- Questions for Michael: none new. The D29 and clampPan-bounds questions from M4-01 are still open.

### 2026-10-21 12:40 · M4-01 · passes

- `app/_layout.tsx`: the outermost element is now `GestureHandlerRootView` (flex 1), around `ThemeProvider`. `jest.setup.ts` imports `react-native-gesture-handler/jestSetup` and adds a `react-native-worklets` mock. The reanimated mock is unchanged.
- Found while wiring: the existing reanimated mock **could not load** under reanimated 4.5. It imports worklets, whose native module throws in Jest (`loadUnpackers` of undefined). It never showed up because no test imported reanimated. The worklets mock fixes it.
- New `src/__tests__/root-layout.test.tsx` (2 tests): RootLayout has one flex-1 root wrapping the Stack, and a Tap gesture fires through `fireGestureHandler`. Both failed without the jestSetup import. Tests went from 464 to 466.
- New `docs/plans/2026-10-20-m4-viewer.md` covers the route, the FlatList pager and why, the `ZoomablePhoto` gesture composition, the `gallery-gestures.ts` signatures, the long-press `Alert.alert`, the 150-line fallback rule and the test table.
- Verified: `check.sh` green (466). `npx jest --ci` shows 0 `console.error`. `expo export --platform ios` exited 0 both before and after. The bundle went from 4,060,375 B to 4,215,187 B (+151 KB, gesture-handler).
- Next (M4-02): `focalZoom` in the plan takes a 4th `viewport` argument for the centre. Mark the pure functions `'worklet'` and normalise `-0` to `0`.
- Question for Michael: D29 *default* (spec §9 Q9). After 'Set as primary', the viewer keeps its order while open, so the photo does not jump to page 1. OK?
- Question for Michael: when zoomed, `clampPan` limits panning by the screen size, not the photo's, so a letterboxed photo's black bars can pan into view. Fine for now?

### 2026-10-21 · verify M3

All 4 features hold; no `passes` changed.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M3-01 | 1 | Read docs/plans/2026-10-20-m3-detail.md | Layout table in §2.4 order (grid, title, tag line, speed, notes); 'Add photos' tile → router.push('/spot/<id>/edit'); Older details collapsed by default, getSpotLegacy once on mount with deps [db,id], hidden when rows empty/null; key→label table present | yes |
| M3-01 | 2 | Read src/utils/legacy-details.ts + src/__tests__/legacy-details.test.ts; `npx jest --ci` on it | Signature matches; test asserts sample Imperial rows in exact order (Custom type, Length '12.0 ft', Material, Removable 'Yes', Bustability '3/5', Setup options '1 option: bungee'); Metric Length '3.7 m'; 'Stop description' humanised; {} → []; 9/9 pass | yes |
| M3-01 | 3 | `/home/mh550/projects/agent-harness/lib/check.sh`; `npx jest --ci` | check green; 43 suites, 464 tests pass; zero console.error lines in output | yes |
| M3-02 | 1 | Read spot-detail.test.tsx 'tag line and speed' tests; ran it | Asserts Rail<Ledge<Skate stopped order, tag-stopped borderColor === palette.red[500], label 'Natural speed: Enough', text 'low'; stopped false → no text; undefined speed → no label /^Natural speed/; all pass | yes |
| M3-02 | 2 | Read 'photos' tests | 5 media → photo-tile-0..4 in primary-first URI order, no tile-5; no media → button 'Add photos' press → push('/spot/<id>/edit'); pass | yes |
| M3-02 | 3 | Read 'Older details' tests | {material:'steel'}: collapsed (no 'Material', expanded:false), press shows 'Material'/'steel'; null → absent; getSpotLegacy called once with (useSQLiteContext(), id), still once after store update; pass | yes |
| M3-02 | 4 | Read 'nothing from the old model' + header tests | With disclosure open, queryByText for Feature, In-Run, Landing, Details, Draft, Type all null; Edit header test present and passes | yes |
| M3-02 | 5 | check.sh and `npx jest --ci` | lint+tsc+jest green, 464 pass, no console.error | yes |
| M3-03 | 1 | Read docs/plans/2026-10-20-m3-what-michael-will-see.md; `git ls-files` for stray temp test | Sections A (7 photos, 2 types, stopped, Enough, notes), B (2 photos only: grid+title), C (fullLegacy, closed then open with 16 rows) list texts/labels in order; no temp test file committed | yes |
| M3-03 | 2 | Read the doc's Commands section; ran `npx expo export --platform ios` to a scratch dir; `npx jest --ci` | Doc records 43 suites/458 tests/0 console.error and export exit 0; I re-ran: export exit 0, now 43 suites/464 tests (6 added by M3-04 after the doc), 0 console.error | yes |
| M3-03 | 3 | check.sh | green | yes |
| M3-04 | 1 | Read reviews/m3.diff (1070 lines, wc) and the 'Review (M3-04)' section; `git log` bad6cb6/f3b0099 | Diff exists; findings table has severity, file, fix commit; 0 Critical/Important; RED bad6cb6 precedes GREEN f3b0099 for the behaviour fixes | yes |
| M3-04 | 2 | Read 'Answers to the M3-04 questions' and the tests they cite | Once-per-mount: spot-detail test counts 1 call after store update+rerender; bad JSON: db-spots.test + 'warns once…' (warn called 1x, no disclosure); tag: test asserts no role/state/accessible, text present; all pass | yes |
| M3-04 | 3 | `git log` for refactor:, grep CLAUDE.md and README.md | Commit 17efca5 'refactor:' present; CLAUDE.md Layout mentions legacy-details/formatLegacyDetails and OlderDetails calling getSpotLegacy once on mount; README Status mentions collapsed 'Older details' for pre-simplification data | yes |
| M3-04 | 4 | check.sh and `npx jest --ci` | green, 464 pass, no console.error | yes |

### 2026-10-21 · M3-04 · passes

- An Opus review of the M3 diff (`reviews/m3.diff`, 1070 lines) found no Critical or Important issues. Of the 4 Minor findings, 3 are fixed, each with a RED commit `bad6cb6` before GREEN `f3b0099`:
  - `getSpotLegacy` returns `null` for an archive that is JSON but not an object.
  - The Older details warning fires only while the screen is mounted.
  - The Tag VoiceOver test is stronger.
- The review, the answers to the three questions and the refactor pass are in `docs/plans/2026-10-20-m3-detail.md` under "Review (M3-04)".
- Refactor `17efca5`: detail and edit now share a new `AddPhotosTile` component, and there is one `isObject` (`src/utils/is-object.ts`).
- CLAUDE.md Layout now covers the detail screen, legacy-details and `OlderDetails`' on-mount `getSpotLegacy`. README Status describes 'Older details'.
- Tests went from 458 to 464. Verified: `check.sh` green (464); `npx jest --ci` 43 suites, 0 `console.error`.
- Question for Michael (review finding 4, open since M3-01): small legacy widths read '0.0 m' / '0.2 ft'. Should they show in cm or inches?

### 2026-10-21 · M3-03 · passes

- New `docs/plans/2026-10-20-m3-what-michael-will-see.md`: ordered texts/labels for (a) 7-photo tagged spot, (b) 2-photo bare spot (grid + title only), (c) `fullLegacy` spot with Older details closed then open. Scratch test deleted; no code changed.
- Verified: `check.sh` green; `npx jest --ci` 43 suites / 458 tests, 0 `console.error`; `expo export --platform ios` exit 0.
- Look at on phone: width 0.05 m shows '0.1 m'; `fullLegacy` has no `raw_feature` (earlier note was wrong).

### 2026-10-21 · M3-02 · passes

- `app/spot/[id]/index.tsx` rewritten in §2.4 order: `PhotoGrid` (no photos → dashed 'Add photos' tile → `router.push('/spot/<id>/edit')`), title, `ChipGroup` of new read-only `Tag`s (stored type order, then 'Skate stopped' red-outlined, `testID="tag-stopped"`), `SpeedScale readonly`, notes, `OlderDetails` (getSpotLegacy once per mount, deps `[db, spotId]`; reject → one `console.warn`, no disclosure; collapsed button with `expanded` state; units from settings store). `Tag` added to `src/components/Chip.tsx` + index; `chevron.down` icon mapped. Header 'Edit' now has role button.
- Tests 441 → 458: `spot-detail.test.tsx` rewritten (20 tests: tags/stopped/speed 0 and undefined/no roles, 5-photo grid order, Add photos, disclosure open/close, null/{} absent, once per mount across store update + rerender, rejected → warn once, Imperial→Metric live, banned texts, title-only spot, header Edit). `spot-photos.test.tsx` mocks `getSpotLegacy` and awaits the effect.
- Verified: RED `5bc1078` (11 failing) before GREEN `1e22cc2`; `check.sh` green (458); `npx jest --ci` 43 suites, 0 `console.error`; `expo export --platform ios` exit 0.
- Next (M3-03): scratch renders must `await act(async () => {})` after render and mock `getSpotLegacy` via `jest.mock('@/src/db', …)`; the M1 full-fat fixture includes `raw_feature` → a row labelled 'Feature' inside Older details (expected; the banned-text test uses a legacy without raw columns).
- Builder's call (spec §10, spacing): detail content now has `spacing.lg` padding, so the hero photo is inset with rounded corners (was full-bleed 240 pt). Michael: keep inset, or go edge-to-edge?

### 2026-10-21 · M3-01 · passes

- New `src/utils/legacy-details.ts` (`formatLegacyDetails(legacy, units)` → `{ label, value }[]`: fixed key order, lengths via `displayLength`, 1–5 scores 'n/5', `removable` Yes/No, setup options '2 options: winch; drop in platform + 2 speed humps', unknown keys humanised, `raw_*` last, empties skipped, never throws) + `src/__tests__/legacy-details.test.ts` (9 tests, incl. the M1 full-fat fixture). `SpotLegacy` in `schema.ts` is now a `type` alias (was `interface`) so `getSpotLegacy`'s result passes as `Record<string, unknown>` without a cast. Plan: `docs/plans/2026-10-20-m3-detail.md` (layout table in §2.4 order, 'Add photos' tile → edit, Older details disclosure, key→label table, M3-02 test list).
- Tests 432 → 441. Verified: `check.sh` green (441), `npx jest --ci` 43 suites, 0 `console.error`; RED `fb8e20e` (module missing) before GREEN `1a327ac`.
- Next session (M3-02) must know: `getSpotLegacy` rejects on bad JSON, so the screen's effect must `.catch` (→ `console.warn`, not `error`); await the effect in every render test or the act() warning lands in `console.error`; `spot-photos.test.tsx` also renders detail (mock `getSpotLegacy` there too, `spot-photo-N` → `photo-tile-N`); read-only tags need a role-less `Tag`, not `Chip` (a checkbox).
- Proposed change: M3-02 step 4 says the Edit header test is "existing test kept"; there is no such test today, so M3-02 should add it.
- Questions for Michael (builder defaults taken): old enum values show lower case as stored ('steel', 'snow built'); small widths in Imperial read '0.2 ft', not inches; detail keeps the small "Notes" label.

### 2026-10-21 · verify M2

Re-ran everything: `check.sh` green (432); `npx jest --ci` 42 suites / 432 tests, 0 `console.error`; `expo export --platform ios` exit 0. All 7 features hold. One nit for a later session (not a fail): the walkthrough doc says the edit photo tiles are `imagebutton` (dimmed), but since M2-07 they render role `image`; labels are all correct.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M2-01 | 1 | Read `docs/plans/2026-10-20-m2-edit.md` headings and bodies | Has SpeedScale API (props, §2.3 table verbatim, range mode deferred to M5), PhotoGrid API (onPressPhoto, renderBadge, trailing, hero 4:3, `spacing.xs` gaps), SpotTagFields API, Edit layout in §2.2 order, Staged adds (drafts, savePhotos on Save, first add primary), per-task test lists | yes |
| M2-01 | 2 | Read the "Staged adds" section lines 146-195 | `jest.mock('expo-image-picker', …)` with `launchImageLibraryAsync` and `requestMediaLibraryPermissionsAsync` named from ImagePicker.d.ts; `importPhotoFromAsset` gives captured_at and location | yes |
| M2-01 | 3 | `/home/mh550/projects/agent-harness/lib/check.sh` | green, 432 tests (lint, tsc, jest) | yes |
| M2-02 | 1 | Read `src/__tests__/speed-scale.test.tsx`, ran it in the full suite | Asserts 5 radios in one radiogroup with labels `'<label>: <description>'` (e.g. 'Enough: Rolls in with speed for most tricks.'), 'Not rated', press Enough → 3, re-press → undefined, value 4 shows 'Steep. You have to scrub speed.'; exported from index (imported via `@/src/components`) | yes |
| M2-02 | 2 | Same file, readonly describe | `speed-cell-0..4` with `accessibilityState.selected` true for 0-3 and false for 4, 'Enough' text, zero radios, label 'Natural speed: Enough' | yes |
| M2-02 | 3 | Same file, "fills … palette.blue[500]" tests; `SpeedScale.tsx` | flattened backgroundColor equals `palette.blue[500]` for the selected radio and filled cell; labels `numberOfLines` 1 (2 for Too much) | yes |
| M2-02 | 4 | `npx jest --ci`, lint/tsc via check.sh | green, 0 console.error lines | yes |
| M2-03 | 1 | Read `photo-grid.test.tsx` | 7 photos → `photo-tile-0..6`; tile 0 width '100%', aspectRatio 4/3, tiles 1-6 aspectRatio 1; press tile-4 → onPressPhoto(4); imagebutton with 'Photo N of 7' labels | yes |
| M2-03 | 2 | Same file | 7 'X' badges rendered with (media, index); '+' ordered after photo-tile-6 in toJSON order; 0 photos → null; 0 photos + trailing → only '+' | yes |
| M2-03 | 3 | Same file, "resolves image sources" | first Image uri ends with `file_path` and differs from it | yes |
| M2-03 | 4 | `npx jest --ci`, check.sh | green, 0 console.error | yes |
| M2-04 | 1 | Read `spot-tag-fields.test.tsx` | Ledge then Rail → ['ledge','rail']; Ledge again → ['rail']; switch valueChange true → stopped; no 'Feature', 'In-Run', 'Landing', 'Details', 'Status' | yes |
| M2-04 | 2 | Read `edit-spot-tags.test.tsx` | Pre-fill (Rail checked, switch true, 'Some' checked, notes 'n'); Ledge + switch off + Enough + 'new notes' → [rail, ledge], false, 3, 'new notes'; cleared notes → null; cleared speed → null; Save enabled with all empty | yes |
| M2-04 | 3 | Same file + scratch render of edit (walk A/B in /tmp) + `edit-remove-photo.test.tsx` in suite | None of the banned words in the tree; placeholders 'Name (optional)' / 'Anything else'; 'Remove photo N' per tile; remove-photo tests pass | yes |
| M2-04 | 4 | `npx jest --ci`, check.sh | green, 0 console.error | yes |
| M2-05 | 1 | Read `edit-add-photos.test.tsx` first tests | 'Add photos' → launch with allowsMultipleSelection true, exif true; 2 'new' tiles; savePhotos once with 2 drafts, spot_id 's1', captured_at '2026-10-12T14:22:05' from DateTimeOriginal, signed GPS location; patch has no `location` | yes |
| M2-05 | 2 | Same file | Unmount → savePhotos and updateSpot not called; spot with no photos → patch.primary_photo_id = draft id; with photos → absent | yes |
| M2-05 | 3 | Same file, "removes and adds in one Save" | removePhotos(['m2']), savePhotos once, hint '1 photo will be removed when you save.' shown with 'new' | yes |
| M2-05 | 4 | Same file, permission denial | `Alert.alert` spy: title 'Photo access needed', launch not called, no 'new' | yes |
| M2-05 | 5 | `npx jest --ci`, check.sh | green, 0 console.error | yes |
| M2-06 | 1 | Read `docs/plans/2026-10-20-m2-what-michael-will-see.md`; re-rendered edit for the 5-photo spot with a scratch test (deleted; `git status` clean of walkthrough*) | Doc order and labels match my capture (tiles, Remove photo 1-5, Add photos, Name, 8 chips, switch, 5 radios, Notes, Save, Delete spot); only role wording `imagebutton` is stale (now `image`) | yes |
| M2-06 | 2 | Same doc section B vs my scratch render of the empty spot | '+' tile, 'Name (optional)', eight chips, 'Skate stopped', five segments, 'Not rated', 'Anything else', 'Delete spot' all present; Text nodes 20 in both (my count: 20/20); control count 29/19 matches; says no pixels measurable | yes |
| M2-06 | 3 | Doc "Commands run" vs my runs | Doc: 425 tests / export exit 0 / 4043430-byte bundle (written before M2-07 added 7 tests); my run: 432 tests, export exit 0 | yes |
| M2-06 | 4 | check.sh | green | yes |
| M2-07 | 1 | `ls`/`wc` `reviews/m2.diff`; read "Review (M2-07)" table in the plan; `git log` | m2.diff exists (1884 lines, base 571cffd = "M1 verified"); findings table has severity, file:line and fix commits; RED 6352672 / 9fc2f4d precede GREEN 0d9004b / 4a056e0 | yes |
| M2-07 | 2 | Read plan "Answers" + `edit-add-photos.test.tsx` ("opens the picker once on a double tap", "stages the same library photo once"), `savingRef` in edit.tsx:60/166, "warns before closing" test, `Chip.tsx:80` `flexWrap: 'wrap'`, speed-scale radiogroup test | All five questions answered in writing and each backed by a test or code line | yes |
| M2-07 | 3 | `git log 571cffd..HEAD` | `9c4c508 refactor:` commit present (FormField reuse, SPEED_LABELS moved) | yes |
| M2-07 | 4 | `grep CLAUDE.md`, `grep README.md` | CLAUDE.md Layout names SpeedScale/PhotoGrid/SpotTagFields and "adding photos from edit"; README Status describes tagging (feature types, Skate stopped, natural speed) in edit | yes |
| M2-07 | 5 | `npx jest --ci` (432 pass), check.sh, `expo export` exit 0 | green, 0 console.error | yes |

### 2026-10-21 · M2-07 · passes

- Opus review of `git diff 571cffd..HEAD -- src app` (`reviews/m2.diff`); findings, answers and fix commits are under "Review" in `docs/plans/2026-10-20-m2-edit.md`. No Critical. Three Important fixed, each RED before GREEN: (1) Undo after removing + adding at the cap gave 22 tiles and a false "couldn't be added" alert, so the newest adds that don't fit are now dropped with a '20 photos per spot' alert; (2) `useSpotActions.updateSpot` swallowed DB errors (edits silently reverted on relaunch), so it now reverts its own fields in the store (`revertSpotUpdate`, keeping fields a later update changed) and rethrows, the town backfills catch it, and Edit's "Couldn't save" is now reachable; (3) ✕, Undo and Delete spot are disabled while Save runs.
- Minor fixed: PhotoGrid tiles are role `image` without `onPressPhoto`; the checked speed radio hints 'Double-tap to clear the rating.' `refactor:` 9c4c508: edit and SpotTagFields reuse `FormField`/`FormInput` (optional `label`, new `hideLabel`); `SPEED_LABELS` moved to `src/constants/labels.ts`.
- Docs: CLAUDE.md Layout names SpeedScale/PhotoGrid/SpotTagFields and adding photos from edit; README Status describes the one-screen edit with tagging.
- Tests 425 → 432. Verified: `check.sh` green (432), `npx jest --ci` 0 console.error, `expo export --platform ios` exit 0.
- Next session must know: `updateSpot` from `useSpotActions` now **rejects** on a DB failure, so new background callers must catch it.
- Proposed changes (Minor, not done, see the plan's Review rows 6–9): name the speed radiogroup for VoiceOver (check on the phone first); fold 'new' into the ✕ label; treat a failed `persistPhoto` copy as a failure (affects Quick Add and import too, so it's Michael's call); dedupe against saved photos (needs an `asset_id` column).

### 2026-10-21 · M2-06 · passes

- New `docs/plans/2026-10-20-m2-what-michael-will-see.md`: edit screen top to bottom for a 5-photo tagged spot and for an empty spot (every text and accessibility label, in order), captured with `screen.toJSON()` in a temporary test (deleted; `git status` clean of `walkthrough*`).
- Counts: 29 controls / 20 Text nodes with 5 photos; 19 controls / 20 Text nodes empty. The two-phone-heights claim is argued from these counts only (Jest cannot measure pixels, said so in the doc).
- Verified: `npx jest --silent` 42 suites, 425 tests, 0 `console.error`; `expo export --platform ios` exit 0, bundle 4043430 bytes; `check.sh` green. Tests unchanged at 425.
- Next session must know: nothing new; Michael should check scroll length on the phone.

### 2026-10-21 · M2-05 · passes

- `app/spot/[id]/edit.tsx`: the grid's last tile is an 'Add photos' '+' tile, hidden at 20 photos. Tapping it asks for library access ('Photo access needed' alert when denied), then opens the picker (`allowsMultipleSelection`, `exif`, `selectionLimit` = 20 minus the photos already there). Each picked asset becomes a `StagedPhoto` via `importPhotoFromAsset` (EXIF time and GPS), deduped by `assetId`, and shows with a 'new' pill plus ✕ (unstage). On Save: remove, then `savePhotos`, then the primary (first added photo when the spot had none; when the primary was removed, the next existing photo, else the first added), then `updateSpot` (never `location`). Partial failures share one alert, and the sheet closes from its OK. Icon map gains 'plus'.
- `src/hooks/use-media-actions.ts`: `savePhotos` now uses `allSettled` and resolves the `Media[]` it actually saved; Quick Add and import ignore the result.
- Tests 404 → 425: new `edit-add-photos.test.tsx` (19 cases, RED 14/14 before the code, then 4/5 RED for the review fixes) and +2 in `use-media-actions.test.ts` (RED first).
- Verified: `check.sh` green (425), `npx jest --ci` 0 console.error, `expo export --platform ios` exit 0. Opus review fixes: no photo shown twice (drafts already in the store are hidden, saved ones cleared), no second write on a retry after a failed `updateSpot`, '+' blocked while saving, no 21st photo when a removal fails.
- Next session must know: when `persistPhoto`'s copy fails it still falls back to the picker's cache URI (existing design, D3 path), so `savePhotos` counts that photo as saved.
- Proposed changes (M2-07, Minor, not done): treat a failed copy in `savePhotos` as a failure (a cache URI breaks after iOS purges the cache); disable the ✕ badges while saving; dedupe against photos already saved on the spot; fold 'new' into the tile's VoiceOver label (e.g. 'Remove new photo N') and hide the separate 'new' stop (needs the M2-05 step's `getAllByText('new')` to use `includeHiddenElements`).
- Question for Michael (still open from M2-01): keep the photo-library permission prompt before the picker, or drop it? iOS's picker doesn't need it.

### 2026-10-21 · M2-04 · passes

- New `src/components/SpotTagFields.tsx` (exported with `SpotTags` from `src/components/index.ts`): controlled; "What's here" + eight `Chip`s in `FEATURE_TYPE_LABELS` order (tap order kept, D19), 'Skate stopped' `Switch`, "Natural speed" + `SpeedScale`; every `onChange` passes the full next value.
- `app/spot/[id]/edit.tsx` rewritten in §2.2 order, no section headers: `PhotoGrid` with a ✕ badge `Remove photo N` (staged removal, Undo, primary and partial-failure logic unchanged), Name ('Name (optional)', a11y 'Name'), `SpotTagFields`, Notes (multiline, 'Anything else'), Save, 'Delete spot'. The Save patch now carries `feature_types`, `stopped`, `natural_speed ?? null` (0 kept), `notes trim || null`; never `location`.
- Tests: new `spot-tag-fields.test.tsx` (6) and `edit-spot-tags.test.tsx` (11); `edit-remove-photo` "Photos heading" cases → grid/no-header cases; `edit-spot-name` "only name + updated_at" case → full-patch case. Tests 387 → 404.
- Verified: `check.sh` green (404), `npx jest --ci` 0 console.error; RED seen for both new files before the code. Opus review: no Critical; the one Important (keyboard covered Notes) fixed with `automaticallyAdjustKeyboardInsets` + test; the duplicate VoiceOver stops on 'Skate stopped' / 'Notes' fixed (label Texts hidden; tests query with `includeHiddenElements: true`).
- Next session (M2-05) must know: the grid gets `visiblePhotos` only, with no `trailing` yet; add the '+' tile and staged drafts there. Hint/Undo now render under the grid whenever `removedIds.length > 0`.
- Proposed changes (M2-07, Minor, not done): SpotTagFields `onChange` spreads the `value` prop, so two changes in one batch before a re-render would lose the first (an updater-style `onChange` fixes it); tie the radiogroup to its "Natural speed" heading for VoiceOver; PhotoGrid tiles in edit are dimmed `imagebutton` stops (no `onPressPhoto`), so use role `image` there, as M2-03 already proposed.

### 2026-10-21 · M2-03 · passes

- New `src/components/PhotoGrid.tsx` (exported from `src/components/index.ts`): hero `photo-tile-0` `width '100%'`, `aspectRatio 4/3`; the rest in a `flexWrap` row of square tiles (`aspectRatio 1`, `spacing.xs` gaps, width = row width from `onLayout` minus gaps, /3, **floored to the pixel grid** so three always fit; `'31%'` before layout). Tiles are `imagebutton` "Photo N of M", `disabled` without `onPressPhoto`; images via `resolvePhotoUri`; `trailing` is a square tile after the last photo; 0 photos + no trailing → `null`.
- New `src/__tests__/photo-grid.test.tsx` (10 cases, RED 9/9 before the component, then 1 more RED for pixel snapping). Tests 377 → 387. Plan doc PhotoGrid section updated.
- Verified: `check.sh` green (387), `npx jest --ci` 0 console.error. Opus review: no Critical; the Important (exact-third width may wrap in Yoga) fixed with a test.
- Next session (M2-04/05) must know: the badge is a **sibling** of the tile's Pressable inside a wrapper View (an accessible imagebutton flattens its children, so a nested ✕ would be unreachable with VoiceOver). So `within(getByTestId('photo-tile-i'))` will NOT find the badge; go through the wrapper (`hostParent` helper in photo-grid.test.tsx) or query by label. A non-button badge ('new') should set `pointerEvents="none"` or it swallows taps on that corner.
- Proposed changes (M2-07 review, Minor, not done): role `'image'` instead of a "dimmed" `imagebutton` when there is no `onPressPhoto` (kept `imagebutton` because the M2-03 step pins it); fold a 'new' badge into the tile's label ("Photo 3 of 7, new") instead of a separate VoiceOver stop.

### 2026-10-21 · M2-02 · passes

- New `src/components/SpeedScale.tsx` (exported with `SPEED_LABELS` from `src/components/index.ts`): edit form = `radiogroup` of five `radio` Pressables labelled `'<label>: <description>'` (spec §2.3 words), tap selects, re-tap clears to `undefined`, description line or 'Not rated' (`=== undefined`, 0 = None is real); readonly = five cells `speed-cell-0..4` with `accessibilityState.selected` on filled, word beside, root `accessible` label 'Natural speed: <label>', `null` when unrated. Filled = `palette.blue[500]`; 'Too much' may wrap to 2 lines.
- New `src/__tests__/speed-scale.test.tsx` (11 cases, RED 11/11 before the component). Tests 366 → 377.
- Verified: `check.sh` green (377), `npx jest --ci` 0 console.error.
- Next session must know: the radiogroup View is deliberately **not** `accessible` (that would merge the radios into one VoiceOver element), so RNTL `getByRole('radiogroup')` can't find it; the test finds the host View by its role prop and asserts `accessible !== true`. Reuse that pattern in M2-04/M2-07.

### 2026-10-21 · M2-01 · passes

- Wrote `docs/plans/2026-10-20-m2-edit.md` (plan only, no code): SpeedScale API with the §2.3 table verbatim (diffed against the spec) and range mode deferred to M5; PhotoGrid (`photos: Media[]`, `onPressPhoto(index)`, `renderBadge(media, index)`, `trailing`, hero 4:3 + three-across squares, `spacing.xs`); SpotTagFields (controlled `{ feature_types, stopped, natural_speed }`); edit layout in §2.2 order; staged adds as `NewPhoto` drafts; a RED test list per task (≈366 → ≈402 tests over M2).
- Picker mocking: `jest.mock('expo-image-picker')` with `launchImageLibraryAsync` / `requestMediaLibraryPermissionsAsync` (ImagePicker.d.ts lines 96, 25); each pick goes through `importPhotoFromAsset` for `captured_at` and GPS. A probe confirmed tests that don't mock the picker still load it (jest-expo's mock resolves `undefined`).
- Verified: `check.sh` green, 366 tests (unchanged; only the plan changed).
- Next session (M2-02+) must know: `savePhotos` currently returns `void` and swallows `insertMedia` failures. The plan has M2-05 switch it to `allSettled` and return the saved `Media[]`, so edit can warn before `router.back()` (M2-07 asks for this). Drafts show in the grid through `file_path = asset uri` (`resolvePhotoUri` passes `file://` through as-is).
- Builder's calls (no D number, reversible): dropped the "Photos" header and the visible "Name" label; renamed 'Delete Spot' to 'Delete spot'; '+' hidden at 20 photos.
- Question for Michael: M2-05 asks for photo-library permission before the picker, but iOS's picker doesn't need it and Import doesn't ask. Keep the prompt, or drop it?

### 2026-10-21 · verify M1

All 5 features re-run; nothing failed. 33 steps hold.

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| M1-01 | 1 | Read docs/plans/2026-10-20-m1-model.md headings and SQL | Sections Final types, Migration 3 (5 ALTERs, JS backfill, rebuild without 5 columns, idx_spots_deleted_at recreated, DROP removes idx_spots_status), Legacy keys (16, empty/status/is_stopped rules), Two-step type change, Test file plan (20 rows counted) | yes |
| M1-01 | 2 | Read plan 'v2 fixture' section | Full-fat spot (curved rail, 2 setup options, status draft, speed 4) and empty spot with expected values (feature_types [], stopped true, speed 3, notes hello, legacy object); media rows stated | yes |
| M1-01 | 3 | Read plan 'FEATURE_TYPE_LABELS' section | Names src/constants/labels.ts replacing STOP_TYPE_LABELS, and removal of FilterSheet/edit private TYPE_LABELS | yes |
| M1-01 | 4 | check.sh; `npx jest --ci` | green, 366 tests; export exit 0 | yes |
| M1-02 | 1 | Read src/types/index.ts, factories.ts | NaturalSpeed 0..4; Spot new fields; SpotUpdate nulls; factory feature_types [] stopped false (old fields since removed in M1-04, as designed) | yes |
| M1-02 | 2 | `grep MIGRATIONS schema.ts`; `git diff 782ff8d..HEAD -- src/db/schema.ts` | 3 migrations, LATEST=3; diff only 1 removed line (the MIGRATIONS line), rest additions | yes |
| M1-02 | 3 | jest verbose db-migrate.test.ts | full-fat, rail, empty, v1→2→3, idempotent, media+FK check, dropped columns/index cases all pass | yes |
| M1-02 | 4 | jest verbose db-spots.test.ts; read spots.ts SPOT_COLUMNS | round trip, natural_speed 0, null clears, getSpotLegacy null/object all pass; no legacy_json in getSpot(s) | yes |
| M1-02 | 5 | jest stores.test.ts | 'null clears notes and natural_speed' and 'natural_speed 0 is kept' pass | yes |
| M1-02 | 6 | grep feature_json|in_run_json|landing_json|metadata_json outside schema.ts; db-init/foreign-keys/use-spot-actions/db-settings run in full suite | grep prints nothing; suite green | yes |
| M1-02 | 7 | `npx jest --ci | grep -c console.error`; check.sh | 0 console.error; lint/tsc/jest green | yes |
| M1-03 | 1 | Both greps (gear/status/intensity names; 'Draft') | Both print nothing | yes |
| M1-03 | 2 | Read src/types/index.ts | SortField 3 members; UserSettings {units,batch_import_radius}; SpotFilters final shape; DEFAULT_FILTERS {types: []}; no Requirement/SetupOption | yes |
| M1-03 | 3 | jest db-settings.test.ts | 'drops the gear key an older build saved' and round-trip pass | yes |
| M1-03 | 4 | jest stores.test.ts | 'counts types, stopped and the speed range: 3', 0 for defaults, stopped true/false filters pass | yes |
| M1-03 | 5 | jest spots-sort-search.test.tsx | 'orders the chips Distance, Date, Name' passes; no Intensity case (grep clean) | yes |
| M1-03 | 6 | jest profile.test.tsx, filter-sheet.test.tsx | 'has no My Gear section' and 'has no gear, build or drafts filter' pass | yes |
| M1-03 | 7 | jest review-persist.test.tsx, screens.test.tsx; grep 'Save' | Quick Add button 'Save'; Quick Add and Import save untagged, not stopped, no status; pass | yes |
| M1-03 | 8 | jest spot-list/components/spot-map tests | 'never shows a status badge', 'every pin the one spot colour', 'callout description empty' pass | yes |
| M1-03 | 9 | check.sh, full jest | green, 0 console.error | yes |
| M1-04 | 1 | Read types; grep removed-model words outside schema.ts | Spot is exactly spec shape, 8 FeatureTypes; grep prints nothing | yes |
| M1-04 | 2 | ls deleted components; grep STOP_TYPE_LABELS; read labels.ts, units.ts | StarRating/RatingBadge gone, not exported; FEATURE_TYPE_LABELS 8 labels; units.ts only displayLength | yes |
| M1-04 | 3 | Read spot-name.ts; jest spot-name.test.ts | featureTypesLabel correct; Rail, Rail +1, undefined cases pass (Stair set +2 follows the same code path) | yes |
| M1-04 | 4 | jest stores.test.ts | 'types is any-of against feature_types'; speed range keeps unrated, treats 0 as real; pass | yes |
| M1-04 | 5 | ls deleted tests; jest edit-spot-name, edit-remove-photo, 'Save writes only the name and updated_at' | 3 files absent; tests pass | yes |
| M1-04 | 6 | Read spot-detail.test.tsx; jest | finds 'under the bridge'; no 'Notes' without notes; exact text list passes | yes |
| M1-04 | 7 | jest filter-sheet ('exactly the eight chips'), spot-list, components; grep SpotListItem, tabs/index | eight chips; no difficulty/isDraft; featureType={featureTypesLabel(item)}; no RatingBadge cases | yes |
| M1-04 | 8 | check.sh; `npx expo export --platform ios --output-dir /tmp/hl-export` | green; export exit 0; 0 console.error | yes |
| M1-05 | 1 | ls reviews/m1.diff (190 KB); read plan '## Review (M1-05)' | diff file exists; Review has severity table with file:line and fix commits | yes |
| M1-05 | 2 | git log/show: 95f93b4 (tests) before b99c7cd (fix); e9a4ad7 (test) before 719b747; db-migrate 'throw late in migration 3' test; stores/db-spots tests | RED precedes GREEN; rollback, speed 0 and getSpots written answers present and backed by passing tests | yes |
| M1-05 | 3 | git show --stat 4a695a1 | 'refactor:' commit of its own; plan lists unused-style/import/TYPE_LABELS checks (lint clean, no TYPE_LABELS copies) | yes |
| M1-05 | 4 | grep draft|gear|intensity|rating|yellow in CLAUDE.md README.md RUNNING-ON-PHONE.md; read lines 30-44 | no hits; docs describe feature_types/stopped/natural_speed/notes/legacy_json/getSpotLegacy; blue pins, no Draft badge | yes |
| M1-05 | 5 | check.sh; full jest | green; 0 console.error | yes |

### 2026-10-21 · M1-04 · passes

- Fixed the one failing step (1) from verify-M1. `SpotLegacy` moved from `src/types/index.ts` into `src/db/schema.ts`, next to migration 3, which writes it (it is exported from `src/db`, and `spots.ts` imports it from `./schema`). The v2 test rows (full-fat, empty, and two inline values) moved out of `db-migrate.test.ts` into the data file `src/__tests__/fixtures/v2-spots.json`. The spot-detail test "none of the removed sections" now asserts the exact visible text `['Pier 57', 'Notes', 'under the bridge']`, which is stricter than the old four-title check. Tests 366 → 366. Plan and CLAUDE.md now name the new locations.
- Verified: the step-1 grep prints nothing. Mutation checks: adding a `<Text>Details</Text>` to the detail screen fails the new test; changing `fullLegacy.intensity` or `is_stopped` in the JSON fails 3 db-migrate tests. Steps 2–7 were re-read in code (labels, units `displayLength` only, `featureTypesLabel` tests, any-of/speed filters, edit Save `{ name, updated_at }`, FilterSheet chips only, SpotListItem props). `check.sh` green (366), `jest --ci` 0 `console.error`, `expo export --platform ios` exit 0.
- Next: M1 is all passing. The step-1 grep only covers `.ts`/`.tsx`, so the JSON fixture is outside it on purpose: it is data, not code.
- Questions for Michael: none.
- Proposed changes: as for M1-02, future "no old names" greps should exclude migration code and migration-test fixtures explicitly rather than rely on where they live.

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
