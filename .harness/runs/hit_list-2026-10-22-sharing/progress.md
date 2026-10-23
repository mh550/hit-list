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

### 2026-10-22 23:59 · S2-02 · passes

- New `src/utils/area.ts`: `RADIUS_STEPS_M`, `DEFAULT_AREA_RADIUS_M`, `spotsInCircle`, `nearestStep`, `radiusLabel`, `areaLabel`, `circleRegion`, `keepsPlace`. The store gains `selectAreaSpots`, the one rule for "in the area". `selectListSpots`, `selectListCounts` and `selectSpotLists` compute an area list's spots from its circle and `area_filters`, with no memberships. `selectSpotLists` now takes the spot instead of the id; detail's `InLists` takes `spot`. `updateList`: `area_place: null` clears the place. `HitListUpdate` gains the area fields, and `updateHitList` (DB) writes them.
- Tests 814 → 841: new `area.test.ts` (14), +9 in `hit-lists-store.test.ts`, +4 in `db-hit-lists.test.ts`. All were RED first: the module was missing, and 11 store/DB tests failed.
- Verified: `check.sh` green with 841 tests, `npx jest --ci` has 0 console.error, and tsc is clean.
- Next (S2-03): `spotCountLabel` still lives in `app/(tabs)/lists.tsx`. Move it to `src/utils/spot-name.ts` when the picker needs '23 spots'. The `createList(name, NewHitList)` and `updateHitList` hook work is S2-04's, as the plan says.
- Questions for Michael: none new (D53–D56 still open in spec §9).

### 2026-10-22 23:40 · S2-01 · passes

- New `docs/plans/2026-10-22-s2-area.md`. It covers: Geometry (`src/utils/area.ts`), Area lists (computed, never stored; one `selectAreaSpots` serves the picker count, the store, detail and the sheet), Picker screen (`app/area/index.tsx`, edit mode via `?listId`), Mock (`Circle`, `animateToRegion`, `geocodeAsync`), Lists tab and list screen, Add-to-list sheet and detail, Copy, a Test list per feature, Risks, and the review base `2488824`. It adds no migration and no dependency. Tests stay at 814 (only docs changed).
- Spec §2 gains D53–D56 *default*, and §9 gains Q14–17. 'Send these N spots' joins the picker in S7.
- Verified: `check.sh` green, 814 tests; the plan has every section that step 1 names.
- Next session (S2-02): `selectSpotLists`'s first parameter becomes the spot (detail is the only caller). `HitListUpdate` gains the area fields (`area_place: null` clears it). `spotCountLabel` moves to `src/utils/spot-name.ts`.
- Questions for Michael: D53, are spots with no location left out of area lists? D54, should the place be your search text / 'my location', or a reverse-geocoded town? D55, should the picker share the Spots tab's filters, with Edit area loading the list's filters? D56, default 2 mi / 2 km, and a saved radius never resized on a units switch?
- Proposed changes: S2-03 step 1 cites `node_modules/react-native-maps/lib/index.d.ts`, but the package has no `lib/`. The types are in `dist/src/index.d.ts` (+ `MapCircle.d.ts`, `MapView.d.ts`), so the mock comment will cite those. S2-04's Lists-tab step replaces S1-05's assertion that 'New area list' is absent.

### 2026-10-23 verify S1

| Feature | Step | What you ran or read | What you saw | Holds |
|---|---|---|---|---|
| S1-01 | 1 | read docs/plans/2026-10-22-s1-hit-lists.md headings | Types, Migration 4, DB API, Store, Hook, SpotsBrowser, Tab bar (D49), Screens, Copy, Test list all present | yes |
| S1-01 | 2 | read plan lines 18-20 | area columns made in migration 4 for S2; sync_queue left alone until S5 | yes |
| S1-01 | 3 | read plan lines 173-205 | shared store filters scoped by spot set; lists the six tests that must pass unchanged | yes |
| S1-01 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-02 | 1 | `git diff 4aa5326..HEAD src/db/schema.ts`; grep LATEST_SCHEMA_VERSION | 37 additions, 1 deletion (only the MIGRATIONS array line); LATEST = MIGRATIONS.length = 4 | yes |
| S1-02 | 2 | db-migrate.test.ts migration 4 block (7 tests), column list asserts | exact hit_lists/hit_list_spots columns; v2 fixture 2→3→4 intact; v4 re-migrate no change | yes |
| S1-02 | 3 | db-hit-lists.test.ts (20 tests) | round-trip, idempotent add, two lists, remove, soft delete keeps spots, FK cascade, rename bumps updated_at, soft-deleted-spot membership kept | yes |
| S1-02 | 4 | grep src/types, src/db/index.ts, factories.ts | HitList/HitListSpot exported, hit-lists re-exported, createTestHitList present | yes |
| S1-02 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green, 0 console.error | yes |
| S1-03 | 1 | hit-lists-store.test.ts (10 tests); stores/index.ts export | selectors and activeListId default null verified | yes |
| S1-03 | 2 | use-hit-list-actions.test.ts passes | create/rename/delete/add/remove, store-first, revert+reject on DB failure | yes |
| S1-03 | 3 | db-init.test.ts 'loads hit lists…', 'getHitLists throws', 'getListMemberships throws'; separate try/catch in use-db-init.ts | isReady stays true | yes |
| S1-03 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-04 | 1 | read SpotsBrowser props; components/index.ts | props present (plus extras); exported | yes |
| S1-04 | 2 | git diff --stat on the six named tests | only spots-view-mode changed (import lines + new describe); others empty; all pass | yes |
| S1-04 | 3 | spots-browser.test.tsx passes | rows, empty title, search/clear, Map segment | yes |
| S1-04 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-05 | 1 | tabs-layout.test.tsx (2 tests); _layout.tsx | Spots, Lists (list.bullet), Profile in order | yes |
| S1-05 | 2 | lists-tab.test.tsx lines 59-73, 117-121, 130 | empty copy, My hit lists, counts ignore deleted, no Shared with me, push /list/<id> | yes |
| S1-05 | 3 | lists-tab.test.tsx lines 140-150, 230 | New hit list sheet, create pushes /list/L-new, double tap guarded | yes |
| S1-05 | 4 | lists-tab.test.tsx:122 | queryByLabelText('New area list') is null | yes |
| S1-05 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-06 | 1 | list-screen.test.tsx; _layout.tsx:49 | two rows, title, Map scoped, filter applies; Stack.Screen registered | yes |
| S1-06 | 2 | list-screen.test.tsx:153 and rename test | Rename sheet, empty copy exactly as written | yes |
| S1-06 | 3 | list-screen.test.tsx:255-256 | Delete Downtown? / Spots stay in your library.; remove-from-list alert | yes |
| S1-06 | 4 | list-screen.test.tsx:308,327 | 'This list is gone' for unknown and deleted ids | yes |
| S1-06 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-07 | 1 | add-to-list-sheet.test.tsx passes | checked states, add/remove calls, two-id case | yes |
| S1-07 | 2 | spot-detail.test.tsx:43,92,284 block | In lists row, only add chip when no lists, chip push /list/<id> | yes |
| S1-07 | 3 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-08 | 1 | spots-select.test.tsx passes | long press selects, counts, cancel, no navigation | yes |
| S1-08 | 2 | spots-select.test.tsx:183-203, 251-256 | select-bar 'Add to list (2)', sheet with both ids, mode ends; no /Send/ | yes |
| S1-08 | 3 | components.test.tsx:131-142 | checkbox role only when selectable | yes |
| S1-08 | 4 | spots-select.test.tsx:109,176 | Add new spot absent in select mode, back after | yes |
| S1-08 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-09 | 1 | list-picker-chips.test.tsx passes | tab roles, selected state, press calls setActiveListId, null with no lists | yes |
| S1-09 | 2 | spots-view-mode.test.tsx:99,128 | only the list's spots in List and Map; empty copy | yes |
| S1-09 | 3 | hit-lists-store.test.ts removeList test | activeListId reset to null | yes |
| S1-09 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-10 | 1 | read docs/plans/2026-10-22-s1-what-michael-will-see.md; ls src/__tests__ | grep walk; git status | five sections in order; no walkthrough test file; tree clean | yes |
| S1-10 | 2 | read sections What to tap, Known limits | both present with the required steps | yes |
| S1-10 | 3 | read lines 84-86 | jest counts, export exit 0, 4.3 MB bundle recorded | yes |
| S1-10 | 4 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |
| S1-11 | 1 | wc -l reviews/s1.diff; read plan Review section; git show --stat e82e658 e218b59 | 4851-line diff; table with severities; both fixes commit tests with fix | yes |
| S1-11 | 2 | read the six written answers in plan Review | all six answered, backed by named tests (db-migrate IF NOT EXISTS case, inFlight, spots-select) | yes |
| S1-11 | 3 | git log 4aa5326..HEAD | grep refactor: | f6e0e0d refactor: commit with the simplification pass | yes |
| S1-11 | 4 | grep CLAUDE.md, README.md | Layout entries, Hit lists convention bullet, README 'Hit lists (S1)' present | yes |
| S1-11 | 5 | `check.sh`; `npx expo lint && npx tsc --noEmit && npx jest --silent` | green | yes |

All 11 S1 features hold; no passes flag changed.

### 2026-10-23 01:45 · S1-11 · passes

- Opus review of `git diff 4aa5326..HEAD -- src app` (`reviews/s1.diff`, 4,851 lines). No Critical findings. Two Important ones, each fixed with a RED test watched failing in the same commit:
  - **I1 `e82e658`:** the open Add-to-list sheet now keeps the ids it opened with. Before, unticking the picker's active list pruned the selection to `[]`, so a re-tick added nothing.
  - **I2 `e218b59`:** `addSpotsToList` is one `INSERT OR IGNORE … SELECT FROM json_each(?)`. Before, a non-exclusive BEGIN/COMMIT on the shared connection meant two adds at once collided. This also covers S1-07's flag.
- The findings, all six answers and the minors not fixed (with reasons) are under 'Review' in `docs/plans/2026-10-22-s1-hit-lists.md`. S1-09's rollback flag (a) is kept as Minor.
- `refactor:` `f6e0e0d`: new `HeaderTextButton` (Filter, Select/Cancel, Rename), `EMPTY_LIST_COPY`, one alert path in `AddToListSheet`, unused React import removed, migration 4 comment corrected.
- Docs: CLAUDE.md Layout and a 'Hit lists' convention bullet; README 'Hit lists (S1)' bullet.
- Tests 807 → 814. `check.sh` green, `npx jest --ci` 64 suites with 0 console.error, `npx expo export --platform ios` exit 0. `spots-sort-search` and `spots-import-action` diffs are empty since `4aa5326`; `spots-view-mode` changed only imports and gained a new describe.
- **Next:** S1 is complete, so the S1 PR is due. Then S2-01. Note for S2: `selectListSpots` goes by membership only (S1-09 note).
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-23 01:05 · S1-10 · passes

- New `docs/plans/2026-10-22-s1-what-michael-will-see.md`: the Lists tab (two lists), the list screen (two spots), the spot detail 'In lists' row (one chip), the Spots tab in select mode (two selected) and the picker row, each with every visible text, role, label, hint and state in rendered order, plus 'What to tap', 'Known limits' and the commands run. Renders came from a temporary `walkthrough-s1.test.tsx`, deleted; `git status` shows no `src/__tests__/walkthrough*`.
- Verified: `npx jest --silent` 64 suites / 807 tests (unchanged), 0 `console.error` under `--ci`; `npx expo export --platform ios` exit 0, 4.3 MB hbc (4,328,700 bytes); `check.sh` green.
- Seen while rendering: the Spots tab keeps the picker row visible in select mode, so a picker tap there prunes the selection (as S1-09 built it). The list screen's empty hint says "select spots on the Spots tab", already noted for S1-11.
- Questions for Michael: none. Proposed changes: none.

### 2026-10-23 00:30 · S1-09 · passes

- New `src/components/ListPickerChips.tsx` (exported). It is connected to the store and takes no props. A horizontal `ScrollView` (`accessibilityRole 'tablist'`) shows 'My spots' then every live list by name (`selectListsByName`). Each chip is a `Chip role="tab"` with `accessibilityState { selected }`. `Chip`'s role union gains `'tab'`, and 'button' and 'tab' report `selected` while 'checkbox' keeps `checked`. With no live lists it renders `null`. The Spots tab (`app/(tabs)/index.tsx`) passes it as `aboveList` and scopes `spots` with `selectListSpots` when `activeListId` names a live list (an unknown id falls back to all spots). Both List and Map are scoped. An empty active list shows 'No spots in this list yet' / "Add from a spot's page or select spots on the Spots tab" with no action. Step 3 (deleting the active list resets `activeListId`) was already covered by `hit-lists-store.test` ('removeList of the active list…').
- Tests 789 → 807. New `list-picker-chips.test.tsx` (8). `spots-view-mode.test.tsx` +7 in a new describe; old cases unchanged, only import lines edited. `spots-select.test.tsx` +3 (picker switch prunes the selection, switching back doesn't re-check, switching to an empty list ends select mode). Watched RED (missing module, then 7 scope cases), then GREEN. `check.sh` green (807), `npx jest --ci` 64 suites with 0 console.error, `npx expo export --platform ios` exit 0 (4.2 MB hbc).
- Opus review: no Critical. Fixed with tests watched failing first: (I) a selection hidden by a picker switch came back checked on switching back. Before, only the shown copy (`chosen`) was filtered; now `selected` itself is pruned to the in-scope ids during render. (Minor) the tablist role. (Minor) the sheet test now asserts `visible`, and the delete test asserts 'My spots' is selected afterwards.
- **For S1-11:** `use-hit-list-actions.ts:88`: if deleting the active list fails, the rollback re-selects it whenever `activeListId === null`, which also overrides a 'My spots' tap made during the delete. That race is now reachable through the picker. Also for S1-11: the empty copy says "select spots on the Spots tab" while you're on the Spots tab (it is the plan's copy, kept).
- **For S2:** `selectListSpots` goes by membership only, so an area list in the picker would show empty until S2 scopes area lists by their centre and radius.
- Questions for Michael: none new. Proposed changes: none.

### 2026-10-22 23:55 · S1-08 · passes

- Spots tab (`app/(tabs)/index.tsx`) has select mode. A row long press enters it with that row checked; 'Select' (label 'Select spots') enters with nothing checked. While selecting, a tap toggles and never navigates, the header title is '<N> selected' (`headerTitle`, so the tab bar label stays 'Spots'), 'Cancel' (label 'Cancel selection') ends it, the FAB column is hidden, and the bottom bar (testID 'select-bar') has 'Add to list (N)' (disabled at 0), which opens `AddToListSheet spotIds={selection}`. Done or a swipe-down ends select mode, and so do Map and the last spot going. Only live spots count and get filed. `SpotListItem` gains `selectable`/`selected` (role 'checkbox' + `accessibilityState { checked }` + a check circle; unchanged otherwise). `SpotsBrowser` gains `onSpotPress`, `selectedIds`, `headerTitle` and `headerLeft`.
- **Deviation from the plan:** Select/Cancel sit in `headerLeft`, not before Filter in `headerRight`. `spots-sort-search`'s header helper reads the one button in headerRight (`getByRole('button')`), so a second button there would have meant editing a guarded test, which S1-11 wants unmodified. All six guarded files have an empty `git diff`.
- Tests 772 → 789: new `spots-select.test.tsx` (14), `components.test.tsx` +3 (SpotListItem). Watched RED (10 failing, then the 2 review cases), then GREEN. `check.sh` green (789), `npx jest --ci` 63 suites with 0 console.error, `npx expo export --platform ios` exit 0 (4.3 MB hbc).
- Opus review: no Critical. Fixed with tests: (I) the selection held deleted spots, so it is now pruned to live spots and select mode ends at 0 spots. (I) `SpotsBrowser`'s options now always carry `headerTitle`/`headerLeft`, which overwrite a layout's; documented in a comment (a screen sets them through the props). Added a navigation control test and a sheet `onRequestClose` test. Not changed: spots hidden by search/filter while selecting stay selected and are counted (like Photos).
- Next (S1-09): pass `ListPickerChips` as `aboveList`, and scope `spots` by `activeListId` in the same screen. The select mode's pruning already reads `spots`, so a picker switch prunes the selection to the list.
- Questions for Michael: none new. Proposed changes: S1-08 step 1's "header shows 'Select' replaced by 'Cancel'" holds on the header's left side.

### 2026-10-22 23:20 · S1-07 · passes

- New `src/components/AddToListSheet.tsx` (exported): a pageSheet Modal titled 'Add to hit list' with 'Done'. It has one checkbox row per live manual list in name order, checked when **every** given spot is in it (never for `[]`), and a '+ New hit list' row that opens the nested `NameListSheet` → `createList`, then adds the spots. Writes happen at once. A failure alerts "Couldn't update the list" or "Couldn't create the list" / 'Please try again.' (copy not in the plan's table). Detail `app/spot/[id]/index.tsx`: a new `InLists` row (label 'In lists', one `Chip role="button"` per `selectSpotLists` → `/list/<id>`, then '+ Add to hit list', label 'Add to hit list') sits between the tag chips and the speed bar. Added `'checkmark': 'check'` to the icon `MAPPING`.
- Tests 751 → 772: new `add-to-list-sheet.test.tsx` (15), `spot-detail.test.tsx` +6. Watched RED (missing module; 5 detail cases failing), then GREEN. Four old detail assertions pinned the whole screen's texts/buttons, so they now include the new row (`IN_NO_LISTS`; the only button is 'Add to hit list'). Their intent (no old-model sections; tags aren't buttons) is unchanged. `check.sh` green (772), `npx jest --ci` 62 suites with 0 console.error, `npx expo export --platform ios` exit 0 (4.3 MB hbc).
- Opus review: nothing Critical or Important. I fixed four Minor findings, with tests: `[]` spotIds checked every row (watched RED), add-failure and create-then-add-failure alerts, the hit-lists store reset moved to the file-level `beforeEach`, and a deleted list next to a live one. **For S1-11:** two fast toggles can overlap, and `withTransactionAsync` isn't exclusive. If A's add transaction fails and rolls back, B's delete inside it rolls back too, though B already resolved, so the store and DB disagree until relaunch. Fix: queue writes in the hook or use an exclusive transaction.
- Next (S1-08): render `<AddToListSheet visible spotIds={selected} onClose={…} />`. It reads the store itself and `useHitListActions` internally, so mock `@/src/hooks/use-hit-list-actions` as add-to-list-sheet.test does.
- Questions for Michael: none new. Proposed changes: none. (Reviewer note: 'In lists' could go below the speed bar instead. I followed the plan's "under the tag line".)

### 2026-10-22 22:45 · S1-06 · passes

- New `app/list/[id]/index.tsx` (registered in `app/_layout.tsx` as `list/[id]/index`, default title 'Hit list'). It renders `SpotsBrowser` with `selectListSpots` (shared filters, search and sort, D52), titled with the list's name. The header has 'Rename' (label 'Rename list') opening `NameListSheet` 'Rename list'/'Save'. A row long press shows an Alert '<display name>' with 'Remove from list' and Cancel. The bottom bar's 'Delete list' confirms with 'Delete <name>?' / 'Spots stay in your library.', then deletes and goes back, or `replace('/(tabs)/lists')` when there's no history. An unknown or deleted id shows 'This list is gone' / 'It may have been deleted.' and resets the header. Failures alert "Couldn't rename the list", "Couldn't remove the spot" or "Couldn't delete the list". I added these strings because the plan's copy table has none for failures.
- `SpotsBrowser` gains `headerActions` (rendered in headerRight before Filter) and `onSpotLongPress`. `SpotListItem` gains optional `onLongPress`.
- Tests 729 → 751: new `list-screen.test.tsx` (19), `spots-browser.test.tsx` +2, `root-layout.test.tsx` +1. All were watched RED (missing module, missing props or route), then GREEN. `check.sh` is green (751), `npx jest --ci` has 0 console.error, and `npx expo export --platform ios` exits 0 (4.2 MB hbc).
- Opus review: no Critical or Important findings. I fixed both Minor ones with tests watched failing first. (1) The header kept the old title and Rename/Filter after the list vanished. (2) Delete with no back history now goes to the Lists tab. I also added a guard so the screen doesn't flash 'This list is gone' while it pops after Delete.
- Next (S1-07/08): in tests, press header buttons through the element's `onPress` (see `openRename` in list-screen.test). Rendering `headerRight()` as a second `render` root makes RNTL 13 drop every later fireEvent on the screen, because it only treats elements in the latest root as mounted. S1-08 should reuse `onSpotLongPress`/`headerActions`. The plan's `onSpotPress`/`selectedIds` props are not added yet.
- Questions for Michael: none new. Proposed changes: none.

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
