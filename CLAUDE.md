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
npm run db:start               # supabase start: the local stack (need Docker; not in CI)
npm run db:reset               # supabase db reset: migrations + seed.sql on a fresh database
npm run test:db                # supabase test db: every supabase/tests/*.test.sql (pgTAP)
npm run db:stop                # supabase stop: always stop the stack after use
npm run test:integration       # src/__integration__ against the local stack (needs the local stack: db:start + db:reset first)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every branch push.

## Layout

- `app/` expo-router screens: tabs Spots · Lists · Inbox · Profile (D49; the Inbox badge is `selectUnseenCount`). `(tabs)/index.tsx` Spots (List | Map via `SpotsBrowser`, a
  `ListPickerChips` row ('My spots' + every hit list) scoping both views, multi-select: long press or 'Select' →
  checkbox rows, '<N> selected', 'Add to list (N)' → `AddToListSheet`; select mode never navigates),
  `(tabs)/inbox.tsx` (S6-04, see `src/sync/`; S7-05 send rows: thumbnail via `createSignedUrl`, Save all / Save into a
  new hit list / Pick spots (`PickSpotsSheet`) / Dismiss, labels name the sender, a save's line at the top (this visit
  only, announced), only 'Try again' while `hasPendingSave`), `sent/` (`app/sent/index.tsx`, S7-05, Profile's 'Sent'
  row: `useSentSends`, Waiting + Withdraw · Saved · Withdrawn), `friends/` (`app/friends/index.tsx`, S6-03, from Profile's 'Friends · N' row:
  Add by exact @username, Friends / Requests sent (Cancel) / Blocked (Unblock), long press Remove friend / Block),
  `(tabs)/lists.tsx` 'My hit lists' (rows with live spot counts, '+ New hit list' → `NameListSheet` → `/list/<id>`),
  `list/[id]/` one list (`SpotsBrowser` scoped to its spots, Rename, long-press 'Remove from list', 'Delete list',
  a 'This list is gone' state; an area list (S2) shows 'Area · 2 mi of <place>' under its title and 'Edit area', no
  Remove), `area/` (`app/area/index.tsx`) 'Pick an area' (`fullScreenModal`: MapView with a fixed centre pin + `Circle`, radius chips,
  'Search a place' (`geocodeAsync` on submit only, never on a region change), 'Use my location', the shared filters, a
  live count; 'Save as hit list' → 'Just these N' (manual list) / 'Keep it updated' (area list); `?listId` = edit mode,
  'Save area'), `(tabs)/profile.tsx`,
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
  `NameListSheet` (create/rename a list), `HeaderTextButton` (the blue header text button: Filter, Select, Rename), `FilterHeaderButton` ('Filter (2)' from the shared filters; SpotsBrowser and the picker), `AddToListSheet` (a checkbox per manual list, checked when every given spot
  is in it, '+ New hit list'), `ListPickerChips` (store-connected, `null` with no lists). `confirmBlock(handle, onBlock)` (S6: the one Block confirm, Friends and Inbox).
  Send (S7-04): `SendSheet` (`{ spotIds, onClose }`, mounted per open; friends with checkboxes, the D34 sentence,
  `syncNow` → `createSend`, can't close while sending; never the word Share in the file, a test reads it), opened from
  the detail header paper-plane (not on another rider's spot), the select bar 'Send (N)', a list's 'Send these spots'
  row (+ an empty `ShareListSlot` for S8) and the area picker; `ToastHost` (root layout, and again in any native
  full-screen modal that can toast: the area picker) shows `src/stores/toast-store.ts` `showToast` (3 s, announces
  once; tests `clearToast()`).
- `src/db/` SQLite access. `schema.ts` holds `MIGRATIONS` (versioned by `PRAGMA user_version`):
  **append a migration, never edit a shipped one**; per-connection pragmas (e.g. `foreign_keys`) go
  next to the WAL line in `migrateDb`, not in a migration. Foreign keys are OFF while migrations run and ON for the app
  afterwards, so a table rebuild is safe; only the `SQLiteProvider` connection has them on (a second connection, e.g.
  `withExclusiveTransactionAsync`, would start with them off). A table rebuild must also drop and recreate the
  migration 5 triggers that name the table (`hit_list_spots_outbox_*` read `spots` and `hit_lists`), or the RENAME fails.
  Migration 5 (S5 sync, plan `docs/plans/2026-10-22-s5-sync.md`): `owner_id` (NULL = phone-only, not adopted) and `rev`
  (the server rev last pulled; only a pull writes it), media `updated_at`/`deleted_at` (`deleteMedia` is a soft delete;
  readers skip deleted rows), `sync_outbox`, `sync_state`; **triggers append the outbox row inside the writing
  statement** when the row's owner is `sync_state.user_id` and `rev` is unchanged (memberships: list and spot both
  owned; a non-rider delete sets `rev = -1` first). `sync.ts`: `enqueue`, `peekOutbox`, `markDone`/`markFailed`/`parkRow`,
  `countPending`/`countFailed`, `resetFailed`, `clearOutbox`, `adoptableMemberships`/`enqueueMemberships`, cursors and
  `getSyncState`/`setSyncState`, the per-account keys `lastSyncKey`/`inboxSeenKey` and `forgetAccount(db, uid)` (clears
  `user_id` and that account's keys; adopt/Remove/release). `insertMedia` takes its spot's owner.
  Push (S5-03): `src/sync/push.ts` `push(db, client, uid, io)` (only with a session for `uid` and `sync_state.user_id =
  uid`; fresh pass stops at its first failure, backoff pass by id; a photo/membership waits behind an earlier row of its
  spot/list; parks 42501 (unless the session ended: stop)/23514/'photo missing'; never sends `shared`),
  `src/sync/photos.ts` (`preparePhoto` ≤ 2048 px JPEG 0.85 into the cache, `defaultPhotoIO`, `uploadPhoto` →
  `photos/<owner>/<spot>/<media>.jpg`), `src/sync/time.ts` `toIso` (every timestamp crossing the server; `'local'`
  for EXIF `captured_at`). Fake client: `fake.calls` logs upsert/delete/upload in order.
  Pull (S5-04): `src/sync/pull.ts` `pull(db, client, uid)` → `{ changed }` (same guard, `src/sync/account.ts` `maySync`;
  pages of 500 by `rev` with a 200-rev overlap, FK order; the LWW `updated_at` guard is inside the UPDATE; a table stops
  at its first failing row; reconciles memberships and others' unreadable spots by asking about local ids only, any
  error or a lost session removes nothing; `failed` when a table could not be read); `downloadMissingPhotos` in photos.ts. Fake client: `fake.tables` answer
  selects (`gt`/`in`/`order`/`limit`), `fake.selects` logs them, `failSelect(match)`, `fake.objects` for downloads.
  Engine (S5-05): `src/sync/engine.ts` `syncNow(db)` (push → pull → downloads on one queue with `runExclusive(task)`;
  joins a sync not yet started, chains one follow-up behind a running one; **a runExclusive task must never await
  syncNow**; reloads the stores only when the pull changed rows and re-reads if they changed meanwhile; 'Backed up'
  (`lastSyncAt`, `sync_state` `last_sync_at:<uid>`) only when every row queued before it is gone and the session
  lasted), `src/stores/sync-store.ts` (`userId`, `lastSyncAt`, `syncing`, `failedCount`, `lastError`; show only when
  `userId` = the signed-in rider), `src/hooks/use-sync.ts` (in `AuthInit` in `app/_layout.tsx`: sign-in, `'active'`,
  every 5 min in the foreground), Spots tab pull-to-refresh (`SpotsBrowser` `refreshControl`, signed in only),
  Profile 'Backed up · 3 min ago' (`src/utils/relative-time.ts`) / 'N changes not backed up' + Retry.
  Adoption (S5-06): `src/sync/adopt.ts` `adopt` (live NULL-owner rows → the rider, one transaction on `runExclusive`;
  another account's rows leave first with their photo folders, `'needs_confirm'` when they still have pending
  changes), `removeLocalAccountData` (refuses with pending changes unless `discardPending`), `releaseAccountData`
  (rows become phone-only) + `removeReleasedRows`; Profile's Delete account calls `deleteAccountAndRelease` (the server
  delete and the release as one `runExclusive` task, so no sync pulls in between; runs before asking); every one clears `user_id`
  before deleting so nothing queues a server DELETE. `src/hooks/use-adoption.ts` (in `AuthInit`: adopt → `syncNow`,
  the D66 confirm, retry on `'active'`); `src/sync/owner.ts` `currentOwnerId()` (sync store `adoptedUserId`) is the
  owner of new spots/lists; `useSpotActions.setTown` keeps `updated_at`. Profile Sign out: last backup (10 s) →
  Keep / Remove / Cancel, or 'N changes aren't backed up yet' (Cancel / Sign out anyway).
  `profiles.ts` (migration 6, S6-02): `upsertProfiles`/`getProfiles`, the local mirror of friend names (D72).
  Migration 7 (S7-02): `spots.copied_from_send`/`from_username` (a saved send's copy, 'From @ana' under the detail title),
  written only by `insertSpot`, never by `updateSpot`. Push/pull carry both (pull only when the server row has the key).
  `hit-lists.ts` (migration 4): `insertHitList`, `getHitLists` (live only), `updateHitList`, `softDeleteHitList`,
  `addSpotsToList` (one `INSERT OR IGNORE … FROM json_each(?)`, idempotent; no `withTransactionAsync` for app writes: it is a
  plain BEGIN/COMMIT on the shared connection, so two writes at once collide), `removeSpotFromList`, `getListMemberships` (`{ spotId: listId[] }`, live lists).
  `spots.ts`: `getSpots`/`getSpot` select the explicit `SPOT_COLUMNS` (never `legacy_json`); `getSpotLegacy(db, id)` is
  the only reader of the archive (rejects on unreadable JSON, `null` for JSON that is not an object); detail's `OlderDetails` calls it once on mount (effect
  keyed on `[db, spotId]`, not on store updates), `.catch` → `console.warn`, and hides the disclosure when it has no rows.
- `src/sync/` backup and sync (S5, details in the `src/db/` paragraph above): the outbox lives in `src/db/sync.ts` (filled by the migration 5 triggers), `push.ts` (outbox → server), `photos.ts` (re-encode into the cache, upload, download), `pull.ts` (server → SQLite by `rev`, LWW), `adopt.ts` (sign-in adoption, account switch, Remove, release), `engine.ts` (`syncNow`, `runExclusive`, `reloadStoresQuietly`), `account.ts` (`maySync`), `owner.ts`, `time.ts`,
`queue.ts` (`runExclusive`, re-exported by engine),
`friends.ts` (S6-02: `loadFriends`/`addFriend`/`respond`/`removeFriend`/`block`/`unblock` take `(client, uid, …)`, do nothing without a session for `uid` and only call the server: the caller then runs `refreshFriends(db, client, uid)` (on the queue, newest load wins, `maySync` before the mirror write); the engine runs `loadAndApplyFriends` after each sync; rpc args are `p_username`/`p_id`/`p_action`/`p_user`), `src/stores/friends-store.ts` (emptied on every `useAuthStore` `userId` change; `dropFriendship`/`noteBlocked`/`noteUnblocked` take a row off as soon as its action went through, S6-07), `src/stores/inbox-store.ts` (S6-04: kind-tagged `InboxItem`s (`friend_request` now; S7/S8 add `send`/`invite`), `setItems(uid, kind, …)` replaces one kind, `removeItem`, `seenAt` = newest server `created_at` seen, `sync_state` `inbox_seen_at:<uid>` (undefined = not loaded, badge 0), `markSeen`/`loadSeen` never move it back, `selectUnseenCount` = the Inbox tab's badge; filled by `loadAndApplyFriends`; emptied on every rider change; adopt/Remove/release clear the key), `app/(tabs)/inbox.tsx` (Friend requests: Accept/Decline, long press Block; marks seen while focused and the app active), migration 6 `profiles` = the local mirror of friend names (`src/db/profiles.ts`, D72; emptied with the account's rows in adopt/Remove/release; never in the outbox),
`sends.ts` (S7-03: `createSend(db, client, uid, { spotIds, recipientIds, sender })` copies each photo to
`sends/<newId>/` then `create_send`, per friend (D76/D77; `NotBackedUpError` unless every spot is owned and has no
outbox row, D78); `loadSends`/`loadAndApplySends` (engine, after friends; Inbox kind `send`); `saveSend` (download →
`runExclusive`{`maySync`, `mark_send_saved(p_id, p_token)`, inserts through `src/db`} → reload; single-flight; a save
the server may have marked stays pending in memory and its retry sends the **same token** and inserts only missing
rows); `dismissSend`, `withdrawSend`, `listSent`; hook `src/hooks/use-sent-sends.ts`), `reload.ts`
(`reloadStores(Quietly)`, re-exported by engine), `PhotoIO.remove`,
`errors.ts` (`errorMessage`, `serverError` keeps a supabase-js error's `code`), `tickets.ts` (`createTickets()`: per rider, the newest load wins; friends and sends loads each have one); push marks a row done only while the rider's session lasts (an anon DELETE answers 204
for 0 rows); a pull keeps the local row on an `updated_at` tie while a change of it waits in the outbox; media
`addMany` skips ids already in the store (a reload may have read them first); accounts (S4) are `client.ts`, `auth.ts`, `session-storage.ts`.
- `src/stores/` zustand: spots (+ the Filter sheet's three filters: What's here `types` (any of), Skate stopped
  `stopped` (undefined = Any, true, false), Natural speed `natural_speed_min`/`_max` (inclusive range, unrated spots kept;
  `selectActiveFilterCount` counts each set filter once, 0–3), a separate `searchQuery`, sort, `viewMode`; filtering and sorting live in its selectors), media (`mediaBySpot`), settings, location,
  hit lists (`lists`, `membershipBySpot`, `activeListId` = the picker, not persisted; pure selectors `selectListSpots`,
  `selectSpotLists` (takes the spot), `selectListCounts`, `selectListsByName`, `selectAreaSpots`, all skipping soft-deleted spots; `useMemo` them, never
  build an array inside `useStore`). The filters, search, sort and List | Map are one set shared by the Spots tab and
  every list screen (D52).
- `src/hooks/` `useDbInit` (migrate, then load spots/media/hit lists + memberships/settings even if the migration threw, background town backfill),
  `useSpotActions`, `useHitListActions` (create (`createList(name, NewHitList)`)/rename/`updateHitList`/delete a list, add/remove spots: store first, then the DB, revert + rethrow on failure), `useMediaActions` (photo save and remove, also used for adding photos from edit: `savePhotos` resolves the `Media[]` it actually saved; removal deletes the row only, D3), `useCurrentLocation`.
- `src/utils/` pure logic: geo (`NO_LOCATION`, `isKnownLocation`, haversine), exif,
  photo-storage, reverse-geocode, spot-name (D4 label), map-region, import-clustering, nearby-spots (`nearbySpots`:
  live known-location spots within a radius, nearest first; `nearbyLabel` 'Near <name> · 16 ft'), area (`src/utils/area.ts`, S2:
  `RADIUS_STEPS_M` per unit in whole metres, `DEFAULT_AREA_RADIUS_M`, `spotsInCircle` (boundary inclusive, never
  `NO_LOCATION`), `nearestStep`, `radiusLabel`/`areaLabel` 'Area · 2 mi of Capitol Hill', `circleRegion`, `keepsPlace`, `isAreaList` (the one "area list with a circle" guard)), send-payload (`src/utils/send-payload.ts`, S7-02: `freezeSend` (frozen fields only, D40; photos primary first,
  `captured_at` as the day, D46), `parseSendPayload(json, sendId)` (throws on a non-send, lenient on content, drops a
  photo whose path isn't `sends/<sendId>/<uuid>.jpg`), `thawSend(payload, { sendId, uid, now, newId, spotIds })` → owned
  spots + media drafts + downloads), gallery-gestures (the viewer's
  pure maths: `clampScale`, `toggleZoom`, `clampPan`, `pagingEnabled`, `shouldClose`, `focalZoom`, `pinchPan`, `doubleTapZoom`,
  `dragDown`), legacy-details (`formatLegacyDetails(legacy, units)` →
  labelled 'Older details' rows: fixed key order, lengths in the user's units, unknown keys humanised, never throws).
- `supabase/` the backend (S3, local stack only; `supabase/README.md`, plan `docs/plans/2026-10-22-s3-backend.md`):
  `config.toml` (`project_id = "hit-list"`), `migrations/` SQL, **append-only** (never edit a shipped one), `tests/`
  pgTAP (`NNN-*.test.sql`; every RLS policy and function has its cases there), `seed.sql` = the `tests` schema only
  (`create_user`, `authenticate_as`, `clear_auth`; runs on `db reset`, never pushed). The CLI is the pinned `supabase`
  devDependency (`npx supabase …`).
  S7-03 migration `20261024010000_sends_s7.sql`: a **staged** send photo (under `sends/<id>/`, `owner_id` = the caller,
  no `sends` row yet) is only its stager's; `create_send` refuses another's staged id, needs a username and stamps
  `payload.sender` (D80); `mark_send_saved` saves once (55000; the same `p_token` again succeeds); `spots.from_username`;
  `staged_send_objects` (service role, account-delete). pgTAP `100-sends-s7`.
  `functions/` Edge Functions (Deno, outside tsc/eslint): `account-delete/index.ts` (the uid comes only from the caller's
  JWT via `auth.getUser`, never the body; 401 without one; removes Storage under `<uid>/` and `sends/<id>/` of every
  send from or to the rider, then `auth.admin.deleteUser`), `_shared/cors.ts`. The local edge runtime does not reload an edited
  function: `docker restart supabase_edge_runtime_hit-list`.
- Accounts (S4, plan `docs/plans/2026-10-22-s4-accounts.md`): `src/sync/client.ts` (`getSupabase()` = one client, or
  `null` unless both `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are set; `isConfigured()`; AppState drives
  `startAutoRefresh`/`stopAutoRefresh`; fixed `storageKey: 'hitlist.auth.session'`), `src/sync/session-storage.ts`
  (D61 LargeSecureStore: an AES key in expo-secure-store, the session ciphertext in AsyncStorage), `src/sync/auth.ts`
  (`sendSignInCode`, `verifySignInCode`, `saveProfile`, `signOutOfAccount` (clears the stored session itself when
  offline), `deleteAccount`), `src/stores/auth-store.ts` (`status` `'unconfigured' | 'signed_out' | 'needs_username' |
  'signed_in'`, `userId`, `username`, `displayName`, `email`), `src/hooks/use-auth-init.ts` (mounted in
  `DBInitializer`; mirrors the session, the profile fetch is deferred out of `onAuthStateChange`), `app/auth/`
  (`sign-in` modal → `code` (six digits auto-verify) → `username` (no back, no swipe, a `Sign out` (D64); the tabs
  `<Redirect>` there while `needs_username`; S5+ must not assume a signed-in rider has a username)), Profile's `Account` section. Tests use `src/__tests__/helpers/fake-supabase.ts`;
  `src/__integration__/` (helpers `createRider`/`deleteRider`/`deleteRiderAndPhotos`; `phones.ts`: `nodePhotoIO`, `FIXTURE`, `sync`/`pushAll`/`pullAll`; `sync.test.ts` (S5-07): two phones of one rider and one phone shared by two riders, node:sqlite + real clients, Node `PhotoIO` with no re-encode; `send.test.ts` (S7-06): D40 frozen copy, save, withdraw, 55000, D77 staging, D80 sender) runs only under `npm run test:integration`.

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
  S1 writes `kind = 'manual'` and NULLs. Lists show in name order (`selectListsByName`). **Area lists (S2)**:
  `kind = 'area'` with the `area_*` columns set; their spots are **computed, never stored** (no `hit_list_spots`
  rows): the live spots inside the circle that pass `area_filters`, via the one `selectAreaSpots` (picker count, list
  screen, counts, detail chips, sheet all use it). Never call `addSpotsToList`/`removeSpotFromList` for one; the sheet
  shows them read-only. Plans: `docs/plans/2026-10-22-s1-hit-lists.md`, `docs/plans/2026-10-22-s2-area.md`; spec
  `docs/specs/2026-10-22-accounts-and-sharing.md`.
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
- **Sync (S5)**: every owned write goes through the `src/db/` functions, so the trigger appends its outbox row in the same statement; never write `spots`/`media`/`hit_lists`/`hit_list_spots` rows from a screen or hook directly, and never write `rev` outside `src/sync/` (a pull write changes `rev`, so it queues no outbox row: no echo loop). `owner_id` NULL = phone-only, not adopted (never synced); a non-NULL owner other than `sync_state.user_id` is another account's row (never queued). New rows take `currentOwnerId()`. Server timestamps go through `toIso`.
- **Send = copy, Share = live: never mix the words (D34)**; the sentences are asserted in `send-sheet.test.tsx` and
  `share-list-sheet.test.tsx` (S8). No Send UI says 'Share' (a test reads `SendSheet.tsx`), and no Share UI says 'Send'.
- **Accounts are optional**: every screen that needs a session checks `useAuthStore` status and shows a one-line
  Sign in prompt, never a disabled control; an unconfigured build (no `EXPO_PUBLIC_SUPABASE_*`) shows 'Accounts
  aren't set up in this build' and everything local still works.
- **.env**: only `.env.example` (empty values) is committed; real values go in the git-ignored `.env.local` (the local
  stack's URL and anon key from `npx supabase status`). Never commit a key or URL; tests and
  `scripts/supabase-env.mjs` pass keys through the environment only, never a file.
- **Docker** (the Supabase stack): Only containers named supabase_*_hit-list belong to this project; never touch dj-*, n8n-* or any other container; never docker system prune; never docker compose in another directory.

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
