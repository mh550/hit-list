# Progress log — run `hit_list-2026-10-22-sharing`

What this is: the running record of this harness run, **newest entry first**. Every session appends
an entry at the top when it finishes (what it built, what it found, what the next session must know).
The work is listed in `feature_list.json` next to this file: the harness gives each fresh session the
first feature whose `passes` is false and whose `after` dependencies pass; array order is priority. A
session changes only its own feature's `passes`. Michael steers the run from the GitHub app by editing
`INBOX.md` on this branch (first line `status: pause` or `status: stop`; answers under `## Answers`);
the harness pulls before every session and every session reads it at startup.

Brief for this run (Michael, 2026-10-22 19:28): build S1–S10 of
`docs/specs/2026-10-22-accounts-and-sharing.md` in order, one PR per milestone, stop only at a
milestone boundary. §1 and §2 are settled. Every feature starts with a failing test (Jest + real
SQLite locally; pgTAP for every RLS policy). Build-only: the backend is the **local** Supabase stack in
Docker via a pinned `supabase` devDependency (`project_id hit-list`); no cloud project, no deploys, no
secrets in files. Stop the stack when a milestone's checks are done. Never touch any container other
than `supabase_*_hit-list`; never `docker system prune`. Dependencies only via `npx expo install`,
lockfile changes in their own `chore:` commit. Every live step goes into
`docs/plans/2026-10-22-live-checklist.md`. Michael is away: a new question gets the simplest reversible
default, recorded as `D<n> *default*` in the spec's §2 (next free number, D52 onward) and asked in §9;
never park. MERGE_POLICY is `pr`: open PRs, merge nothing.

### 2026-10-22 22:05 · S1-05 · passes

- Tabs are now Spots · Lists · Profile (`app/(tabs)/_layout.tsx`, Lists: `list.bullet`, header 'Hit lists'; `'list.bullet': 'format-list-bulleted'` added to `MAPPING` in `components/ui/icon-symbol.tsx`). New `app/(tabs)/lists.tsx`: a '+ New hit list' row (label 'New hit list'), a `SectionList` with 'My hit lists' (name order, live counts '1 spot' / 'N spots', row label '<name>, N spots', press → `/list/<id>`), or `EmptyState` 'No hit lists yet' (no second action). New `src/components/NameListSheet.tsx` (exported): fade Modal card, input 'Name' (label 'List name'), Cancel + confirm. Confirm is disabled while the trimmed name is empty or a submit is running (a ref also blocks a same-tick Return + tap), Cancel/backdrop do nothing mid-submit, `submitBehavior="submit"`. A failed create shows Alert "Couldn't create the list" / 'Please try again.' and leaves the sheet open (copy not in the plan's table; added so failures aren't silent).
- Tests 712 → 729: new `tabs-layout.test.tsx` (2) and `lists-tab.test.tsx` (15, mocked `useHitListActions`). Watched RED (missing `lists` tab and module), then GREEN. The Opus review found nothing Critical. Fixed with tests watched failing first: cancel during a submit, same-tick double submit, counts that update live, case-insensitive order, all-deleted lists, blank name + Return. `check.sh` green (729 tests). `npx jest --ci`: 60 suites, 0 console.error lines. `npx expo export --platform ios` exit 0 (4.3 MB).
- Next (S1-06): `app/list/[id]` doesn't exist yet, so on the phone a row tap or Create lands on an unmatched route until S1-06. Reuse `NameListSheet` for Rename (`title='Rename list' initialName confirmLabel='Save'`; `onSubmit` must throw on failure to keep the sheet open). Two lists with the same name and count share an accessibility label (minor, left as is).
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 21:35 · S1-04 · passes

- New `src/components/SpotsBrowser.tsx` (exported from `src/components/index.ts`): the Spots tab's whole List | Map body moved over unchanged: SegmentedControl, search, SortChips, SpotMap, both empty states, FlashList, the header Filter button (its own `<Stack.Screen options={{ headerRight }} />`) and FilterSheet. Props `spots, emptyTitle, emptyMessage, emptyActionLabel?, onEmptyAction?, aboveList?` (rendered above the mode bar) and `contentBottomInset?` (default `spacing.md`). `app/(tabs)/index.tsx` is now 90 lines: `<SpotsBrowser spots={all} …/>` + the FAB column, passing `LIST_BOTTOM_PADDING` as the inset.
- Tests 706 → 712: new `spots-browser.test.tsx` (6: two rows, empty title/message/action, searchQuery narrows then 'No matching spots' + 'Clear search', Map hands SpotMap the filtered spots, bottom inset, aboveList). Watched RED (SpotsBrowser undefined, 6 failing), then GREEN. The six guarded files (spots-view-mode, spots-sort-search, spot-list, spot-map, filter-sheet, spots-import-action): `git diff --stat 4aa5326` on them is empty and all pass. `check.sh` green (712 tests), `npx jest --ci` 0 console.error lines. A `diff` of the old screen against SpotsBrowser shows only the props, `aboveList` and the inset.
- Next (S1-05/06): SpotsBrowser has no `headerActions`/`onSpotPress`/`onSpotLongPress`/`selectedIds` yet (S1-06/S1-08 add them per the plan). Every SpotsBrowser sets `headerRight` itself, so a screen that wants its own header buttons must pass them through `headerActions`, not its own Stack.Screen headerRight.
- Questions for Michael: none new.
- Proposed changes: S1-04 step 2 says the Spots tab renders "the Filter header button"; per the S1 plan the Filter button lives in SpotsBrowser (it owns FilterSheet, and every list screen needs it too). The tab still shows it; read the step as "the tab still shows it".

### 2026-10-22 21:10 · S1-03 · passes

- New `src/stores/hit-lists-store.ts` (lists, membershipBySpot, activeListId + the plan's 8 actions; pure selectors `selectListSpots(list, spots, m)`, `selectSpotLists(spotId, lists, m)` (name order), `selectListCounts`, `selectListsByName` (case-insensitive)), exported from `src/stores/index.ts`. New `src/hooks/use-hit-list-actions.ts` (createList/renameList/deleteList/addSpotsToList/removeSpotFromList: store first, DB after, on rejection `console.error('[useHitListActions] <fn> failed:')`, revert, rethrow). `useDbInit` loads `getHitLists` then `getListMemberships` after media, before settings, each in its own try/catch.
- Tests 680 → 706: `hit-lists-store.test.ts` (10), `use-hit-list-actions.test.ts` (13, real node:sqlite via a `useSQLiteContext` override, failures via `jest.spyOn(db, 'runAsync'|'withTransactionAsync').mockRejectedValueOnce`), `db-init.test.ts` +3 (its `@/src/db` mock gained the two getters). Watched RED (missing modules, then 3 db-init failures), then GREEN; `check.sh` green (706 tests, 0 console.error), target suites stable over 3 reruns.
- Opus review: no high-severity bugs. Fixed: a failed deleteList no longer overwrites a list picked while it was pending (test watched failing first). Left for S1's review feature (overlapping writes only): (1) two pending addSpotsToList of the same spot, first fails/second succeeds → store drops a spot the DB has; (2) two overlapping renames that both fail, or share a millisecond stamp, can leave store ≠ DB; (3) a rename during a pending delete that then fails restores the stale name. Fix idea: revert by re-reading the row/memberships from the DB.
- Next (S1-04): store state the screens read is `useHitListsStore((s) => s.lists)` / `s.membershipBySpot` + `useMemo` the selectors; `deleteList` keeps the deleted list's ids in `membershipBySpot` (selectors skip absent lists) so a revert is clean.
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 20:40 · S1-02 · passes

- Migration 4 (`src/db/schema.ts`, `IF NOT EXISTS`): `hit_lists` (13 columns, area + owner reserved) and `hit_list_spots` (PK list_id+spot_id, both FKs `ON DELETE CASCADE`) + `idx_hit_lists_deleted_at`, `idx_hit_list_spots_spot_id`. Only the `MIGRATIONS` array line changed; migrations 1–3 untouched.
- New `src/db/hit-lists.ts` (insertHitList, getHitLists, updateHitList, softDeleteHitList, addSpotsToList, removeSpotFromList, getListMemberships), re-exported from `src/db/index.ts`; `HitList`, `HitListKind`, `HitListSpot`, `HitListUpdate` in `src/types/index.ts`; `createTestHitList` in `factories.ts` (fixed 2026-10-01T12:00Z stamps).
- Tests 656 → 680: new `db-hit-lists.test.ts` (17 cases: round-trip incl. area columns, idempotent add keeps first added_at, two lists, remove, soft delete keeps spots, both cascades, FK rejects unknown spot, rename bumps updated_at, deleted list not updatable, soft-deleted spot keeps its row, bad area_filters_json → warn) + 7 migration-4 cases in `db-migrate.test.ts`. Watched RED (missing factory/migration), then GREEN; `check.sh` green (680 tests, 0 console.error).
- Plan correction: four existing migration-3 cases pinned `toBe(3)` and the fresh-DB table list, so they now use `LATEST_SCHEMA_VERSION` / include the two tables (the plan said none needed editing).
- Next (S1-03): `softDeleteHitList`/`addSpotsToList` take an optional ISO stamp (default now) so the hook can pass the store's stamp; `getListMemberships` ignores deleted lists but not deleted spots.
- Proposed changes: S1-02 step 1 "additions only" can't hold literally (the `MIGRATIONS = [...]` line must change); read it as "migrations 1–3 unchanged".

### 2026-10-22 20:10 · S1-01 · passes

- New `docs/plans/2026-10-22-s1-hit-lists.md`: decisions, Types, Migration 4 (exact SQL, `IF NOT EXISTS`, two indexes `idx_hit_lists_deleted_at`, `idx_hit_list_spots_spot_id`), DB API, Store, Hook (revert table), SpotsBrowser, Tab bar, Screens, Copy, a RED test list per feature S1-02…S1-09, risks. Docs only; tests 656 → 656.
- Spec: **D52 *default*** in §2 (one set of filters/search/sort/List|Map shared by the Spots tab, list screens and the picker) and asked as §9 Q13.
- Verified: every required section/string grepped in the plan; `check.sh` green (656 tests, 13 s).
- Next sessions: SpotsBrowser keeps exactly S1-04's props plus optional `contentBottomInset` (S1-04); `headerActions`, `onSpotPress`, `onSpotLongPress`, `selectedIds` are added by S1-06/S1-08 (Filter stays in SpotsBrowser's `headerRight`, screens set only `title`). `'list.bullet'` must be added to `MAPPING` in `components/ui/icon-symbol.tsx` (typed names). Existing migrate tests use `LATEST_SCHEMA_VERSION`, so none needs editing. Lists tab header title is 'Hit lists' (`headerTitle`), tab label 'Lists'.
- Question for Michael: D52 (§9 Q13): filters shared across the Spots tab and lists (default), or per list?
- Proposed changes: none.

### 2026-10-22 · init (Fable) · feature list written

**Counts.** 76 features in 10 milestones: S1 hit lists 11 · S2 area lists 6 · S3 backend 8 ·
S4 accounts 8 · S5 sync 9 · S6 friends and Inbox 7 · S7 Send 8 · S8 shared lists 9 · S9 links 7 ·
S10 sweep 3. Models: 66 opus, 10 sonnet (checks and docs). Every milestone: plan → builds (pure rules
before wiring, DB before store before screen) → `check` ("what Michael will see", sonnet) → review +
simplify (opus). The first feature of each milestone carries `after`: S1 `[]`, S2 `[S1]`, S3 `[]`
(the SQL side is independent of the app), S4 `[S3]`, S5 `[S2, S4]`, S6 `[S4]`, S7 `[S5, S6]`,
S8 `[S5, S6]`, S9 `[S7, S8]`, S10 `[S9]`. In the last run (hit_list-2026-10-20, 39 features) opus
features took 1–16 min each; these are sized a little larger because the backend ones carry Docker
and pgTAP.

**Baseline.** `main` at `5c7404e` merged into this branch; `4aa5326` is the run's start commit (use it as
the S1 diff base). 54 suites, 656 tests, check green in 40 s. Node 24.21, npm 11.19, Docker 29.1.3
(Pop!_OS 24.04), 651 GB free. `gh` is logged in as mh550, git protocol ssh.

#### Where things live (read CLAUDE.md first; this adds what the spec needs)

- **Local DB**: `src/db/schema.ts` has 3 migrations (`MIGRATIONS`, `PRAGMA user_version`). Append only. The
  plan reserves: migration 4 = `hit_lists` + `hit_list_spots` with the area columns (S1); 5 = `owner_id`
  on spots/media/hit_lists + `sync_outbox` + `sync_state`, and drops the never-used `sync_queue` from
  migration 1 (S5; `SyncQueueItem` in `src/types/index.ts` goes with it); 6 = local `profiles`
  (S6); 7 = `copied_from_send`, `from_username` on spots (S7); 8 = `hit_list_members` (S8). Tests use
  `src/__tests__/helpers/node-sqlite-db.ts` (`createTestDb` / `createMigratedTestDb`); `db-migrate.test.ts`
  checks every version step with `PRAGMA table_info`.
- **DB access pattern**: `src/db/spots.ts` selects explicit `SPOT_COLUMNS`, maps rows in `rowToSpot`
  (`natural_speed` 0 is real; `null` → undefined), and `src/db/index.ts` re-exports everything. Hooks
  (`use-spot-actions.ts`) write the zustand store first, then the DB, and revert on failure. Copy that
  pattern for hit lists (`src/db/hit-lists.ts`, `use-hit-list-actions.ts`).
- **Screens**: `app/(tabs)/_layout.tsx` has two tabs (index = Spots, profile); S1 adds `lists`, S6 adds
  `inbox` (order Spots · Lists · Inbox · Profile, D49). `app/(tabs)/index.tsx` (299 lines) holds the
  List | Map body that S1-04 extracts into `SpotsBrowser` so `app/list/[id]/index.tsx` can reuse it.
  New stack screens register in `app/_layout.tsx`. The detail screen is `app/spot/[id]/index.tsx`
  (the 'In lists' row goes under the tag line). Profile is `app/(tabs)/profile.tsx` (Units + Import
  radius; the Account section goes on top).
- **Mocks**: `jest.setup.ts` mocks expo-router (`useRouter`/`useLocalSearchParams` overridable),
  expo-sqlite (`useSQLiteContext` → `{}`; real queries need the node:sqlite harness), expo-location,
  expo-image, FlashList (renders every row), icons (`testID icon-<name>`), expo-crypto (Node crypto).
  `__mocks__/react-native-maps.tsx` exports `MapView` (default), `Marker`, `mockMapMethods`; S2-03 adds
  `Circle` and `onRegionChangeComplete`. `jest-environment-jsdom` is already in node_modules (via
  jest-expo) for the S9 web page test.
- **Ids** from `newId()` (expo-crypto). Tokens (S9) also from expo-crypto (`getRandomBytes`,
  `digestStringAsync`), never the `uuid` package or Node crypto in app code.

#### Supabase: facts checked at init

- No `supabase` CLI on the box and no Supabase images in Docker yet: S3-01's first `npx supabase start`
  pulls ~2 GB of images; expect several minutes. Ports 54321–54324 are free (only Metro's 8081 is
  listening). Other containers on the box: `dj-*`, `n8n-*`. **Only `supabase_*_hit-list` is ours.**
- Registry at init: `supabase` 2.121.0, `@supabase/supabase-js` 2.118.0 (deps auth-js, postgrest-js,
  storage-js, realtime-js, functions-js, same version), `expo-secure-store` 57.0.4,
  `expo-image-manipulator` 57.0.21. Install with `npx expo install <pkg>` (use `--dev` for the CLI and
  `-- --save-exact` to pin it); `npx expo install` picks the SDK-57-compatible version of Expo packages.
- `npx supabase init` writes `supabase/config.toml`; set `project_id = "hit-list"`. `supabase test db`
  runs `supabase/tests/*.sql` with pg_prove inside the db container (pgTAP is bundled). `supabase/seed.sql`
  runs on `db reset` only and is never pushed by `db push`: that is where the `tests` schema helpers go
  (`tests.create_user`, `tests.authenticate_as(uid)` = `set local role authenticated; set local
  request.jwt.claims = '{"sub": "<uid>", "role": "authenticated"}'`, `tests.clear_auth`).
- Edge Functions are served by `supabase start`'s edge-runtime container at
  `http://127.0.0.1:54321/functions/v1/<name>`; `[functions.<name>] verify_jwt = false` in config.toml
  makes one public (share-preview). Supabase rewrites `text/html` responses from functions, hence the
  static page in `web/share/` (D45).
- Email codes in the local stack land in Mailpit at `http://127.0.0.1:54324`. Integration tests avoid the
  mailbox: `auth.admin.generateLink({ type: 'magiclink', email })` returns `properties.email_otp`, then
  `verifyOtp({ email, token, type: 'email' })`.
- Keys: `npx supabase status -o json` prints the anon and service-role keys. They are the public local
  demo keys, but the brief says no secrets in files: `scripts/supabase-env.mjs` (S4-06) injects them into
  the test process; `.env.example` holds empty values; `.gitignore` today ignores only `.env*.local`, so
  S4-01 adds `.env`, `.env.*`, `!.env.example`.
- Integration tests (`src/__integration__/`, `jest.integration.config.js`, `npm run test:integration`)
  are outside the default Jest config so CI and `npx jest --ci` never need Docker.
- `supabase-js` in Jest: unit tests use a hand-written fake (`src/__tests__/helpers/fake-supabase.ts`)
  whose member names come from `node_modules/@supabase/*/dist/module/*.d.ts` (CLAUDE.md's "fakes mirror
  the real API" rule). Photo upload takes an injectable byte reader so Node integration tests pass a
  Buffer while the app passes expo-file-system `File` bytes.

#### Gotchas for workers

- **RED first, really.** For pgTAP the feature steps ask for the RED commit hash in the plan's Review
  section; the verifier checks `git log`. Commit the `.test.sql` before the migration that makes it pass.
- **Stop the stack** at the end of every feature that started it (`npx supabase stop`), and record it:
  the step "docker ps shows no supabase_* container" is verified.
- **The Spots tab's existing tests must pass unmodified** after the S1-04 extraction (the step says
  `git diff --stat` on those files shows at most import edits).
- **Copy is asserted.** The D34 sentences and the Send/Share word rule are exact strings in the steps;
  put them in `src/constants/copy.ts` (or next to the component) and reuse the constant in the test.
- `console.error` in Jest is a failure. Sync failures log with `console.warn`.
- Lockfile changes go in their own `chore:` commit; `npm dedupe` if `expo-modules-core` nests.
- `after` on a feature means the harness can run it while an earlier feature waits; it does not mean it
  runs on a different branch. Everything is one linear branch; milestones become PRs in order.
- Diff bases for reviews: S1 uses `4aa5326`; later reviews name the last commit of the previous milestone
  in their plan's Review section.

#### Decisions taken here (defaults for Michael, all reversible; the plan sessions record them as D52+ in the spec)

1. **Migration split**: several appended local migrations (4–8), one per milestone, instead of the spec's
   single "new migration". Same end state; each milestone ships alone.
2. **`sync_queue` dropped** in migration 5 (never read by any code; `sync_outbox` replaces it).
3. **`hit_list_members.status`** 'invited' | 'member': §3.5's Join / Decline needs a pending state the
   §3.2 table lacks; RLS grants reads to 'member' only.
4. **Session storage**: Supabase's documented LargeSecureStore (AES key in expo-secure-store, ciphertext in
   AsyncStorage) because an OTP session JSON can exceed SecureStore's 2048-byte value limit.
5. **Sign-out prompt** (D38 Keep / Remove) arrives in S5, not S4: in S4 nothing is backed up yet, so
   "Remove from this phone" would lose data. S4 signs out plainly.
6. **Switching accounts on one phone**: when a different account signs in, the previous account's local
   rows and photo files are removed (its data was pushed), and unowned rows are adopted by the new account.
7. **Send photo copy** is done by the client with `storage.copy` into `sends/<send_id>/` before
   `create_send`; S7-01 decides one-row-per-recipient vs a shared photo set and re-checks the storage policy.
8. **Link token in the URL fragment** (`#t=`), so it never reaches a server log; the page reads it and
   calls the function with `?t=`.
9. **Area list ignores NO_LOCATION spots**; the place label is the search text typed (or "my location").

#### Questions for Michael (defaults above are built unless you answer in INBOX.md)

- §9 Q1–Q12 of the spec stand as written; nothing re-opened.
- Q13 (new): is "hit list" alongside the Lists tab's "List | Map" toggle fine, or should the tab be
  called "Hit lists"? Default: tab title "Lists", screen header "Hit lists".
- Q14 (new): the first `npx supabase start` pulls ~2 GB of Docker images onto the box. Default: go ahead.
- Q15 (new): photos sent by link are visible to anyone holding the link for 30 days (D44 default). If you
  would rather every link needs an account, say so before S9 starts.
