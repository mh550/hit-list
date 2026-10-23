# S8 plan: Shared hit lists (live access, D34 "Share")

> **For agentic workers:** one harness session per feature (S8-02 … S8-09); each build feature commits its test file
> **RED first** (`S8-0n: RED …`, first run fails, note the failure in the message), then the code that makes it pass.

**Goal:** the owner of a hit list shares it with friends (role **Can add spots** or **View only**, D42). An invited
friend sees '@ana invited you to Downtown (12 spots)' in the Inbox (and on the Lists tab) and Joins or Declines. A
member sees every spot in the list, now and later, read-only (D47), with owner badges, lazily cached photos and
**Save a copy**; a member with 'add' puts their own spots in it. Leave / Remove / Stop sharing take a member's spots out
with them (D43) and take others' spots off their phone at the next sync. Every place a shared list appears carries the
two-people icon and its member count; the first add to a shared list asks first. The word is always **Share** /
**Shared** / **Invite** with the two-people icon (D34); 'Send' never appears in a Share screen.

**Architecture:** the server already does the sharing (S3-04, `supabase/migrations/20261023021848_lists_rls.sql`,
pgTAP `040-lists-rls`): `hit_list_members (list_id, user_id, role, status 'invited'|'member', invited_by, invited_at,
joined_at, rev)`, insert policy (owner, `status 'invited'`, `invited_by = auth.uid()`, a friend, no block), update
(owner: role only; the row's user: `invited` → `member` only, which stamps `joined_at`), delete (owner or the row's
user), `leave_list(p_list)`, `remove_member(p_list, p_user)`, `stop_sharing(p_list)`, triggers that drop a leaving
member's spot rows (D43) and every member + non-owner row on unshare, `can_read_spot` (manual and area branches),
storage reads through `can_read_photo` → `can_read_spot`, co-member profiles via `can_read_profile`. **One server
migration in S8** (S8-02): `list_invitations()` (an invitee can't count a list's spots under RLS, D83) and
`share_list(p_list)` (turns sharing on without the client's clock meeting the stale guard). The client adds
local migration 8, `src/sync/lists.ts`, pull changes (members mirror, per-list fill, list reconciliation, foreign
photo paths), `src/sync/copy.ts`, a photo cache (`cachedPhotoUri`, `usePhotoUri`), `ShareListSheet`,
`app/list/[id]/members.tsx`, the markers and the Inbox/Lists invitations.

**Tech stack:** `@supabase/supabase-js` 2.118 (`from().update().eq().select()`, `insert`, `delete`, `rpc`,
`storage.from('photos').download`), expo-sqlite 57, expo-file-system 57 (`Paths.cache`), zustand 5, expo-router 57.
**No new dependency.** `components/ui/icon-symbol.tsx` gains `'person.2.fill': 'group'` in `MAPPING`.

**Spec:** §1 (Share, D34 sentence, markers, first-add confirmation, side-by-side actions, ownership), §3.3, §3.4
("removes local copies", "Others' photos … `Paths.cache`"), §3.5, §5.1, §5.2, §5.5, §7 S8, D34, D41, D42, D43, D47,
D50, D57, D58, D60, D72; new D83–D91. **Diff base for the S8-09 review: `5792dba`** (HARNESS: S7 verified).

## Global constraints

- `src/sync/lists.ts` functions take `(db, client, uid, …)` and guard with `maySync` / `signedInAs` like
  `friends.ts`/`sends.ts`: no session for `uid` → no call, resolves `false`/throws `NotSignedInError` as those do.
- **A foreign row** is one whose `owner_id` is set and ≠ `uid` (`isForeign(row, uid)` in `src/sync/owner.ts`). It is
  never written by a screen or hook (D47), never queued (the migration 5 triggers already compare with
  `sync_state.user_id`), never sent (S7 entry points filter it, D87), and only written/removed by `src/sync/` (pull,
  lists.ts leave/stop, adopt's account switch, sign-out).
- **`shared`, the members mirror and foreign rows are written only with the server's `rev`** (pull's `applyOwned`,
  exported from `pull.ts` for `lists.ts`), so nothing echoes into the outbox. `shareList` writes the row its `update`
  returned; `stopSharing` re-reads the row after the rpc.
- **Local multi-row removals** (Leave, Stop sharing, a reconciled list) run in `runExclusive` + one
  `db.withTransactionAsync` (adopt's pattern); membership rows are set `rev = -1` before their DELETE so no trigger
  queues a server delete. Cache files are deleted after the commit (files aren't transactional).
- **Others' photos live under `Paths.cache/photos/<spotId>/<mediaId>.jpg`, never `Paths.document`** (§3.4). A foreign
  media row's `file_path` is `cache/photos/<spotId>/<mediaId>.jpg` (written by pull); `resolvePhotoUri` maps the
  `cache/` prefix to `Paths.cache`. `downloadMissingPhotos` already selects `owner_id = uid` and `LIKE 'photos/%'` only.
- The member count shown anywhere = rows with `status 'member'` + 1 (the owner) (D84); invited rows never count.
- Server errors are `console.warn`; the UI shows fixed copy only (Copy table). Server times through `toIso`.
- Every Share screen's copy is asserted; `grep -n 'Send' src/components/ShareListSheet.tsx app/list/[id]/members.tsx`
  prints nothing (comments included), and a test reads both files against `/\bsend/i`.
- `npx expo lint && npx tsc --noEmit && npx jest --silent` green after every feature, zero `console.error`.

## Migration 8 (S8-02) — `src/db/schema.ts`

```sql
CREATE TABLE hit_list_members (
  list_id TEXT NOT NULL,          -- no FK: an invitation's list isn't held locally until Join
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'add' CHECK (role IN ('add', 'view')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'member')),
  joined_at TEXT,
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX idx_hit_list_members_user ON hit_list_members(user_id);
```

No trigger on it (never pushed; a mirror like `profiles`). **Also in migration 8** (proposed change to S8-02 step 1's
"nothing else"): drop and recreate `hit_list_spots_outbox_ins`/`_del` so a member's add/remove queues. Today's rule
(`membershipIsMine`: list **and** spot owned) never queues B's add to A's list, so S8-07's "B adds a spot … push
succeeds" could not happen. New rule, literal SQL next to the old one:

- insert queues when `NEW.rev IS NULL` and the spot is `ME`'s and the list has an owner (mine or a friend's);
- delete queues when `OLD.rev IS NOT -1` and (the list is `ME`'s and the spot has an owner, D42: the owner removes any
  spot) or (the spot is `ME`'s and the list has an owner).

A phone-only (NULL-owned) list or spot still never queues (adoption queues those). `addSpotsToList(db, listId,
spotIds, addedAt, addedBy = null)` writes `added_by` (the hook passes `currentOwnerId()`); push keeps sending
`added_by: uid`. Push already parks 42501 (a view-only add that slipped through, S8-07's C case).

`src/db/hit-lists.ts`: `upsertMembers(db, rows)`, `replaceMembers(db, rows)` (the mirror becomes exactly `rows`: one
`DELETE … WHERE list_id || '/' || user_id NOT IN (SELECT value FROM json_each(?))` + `INSERT … ON CONFLICT DO
UPDATE`), `getMembers(db, listId)`, `getMyMemberships(db, uid)` (`{ listId: { role, status } }`), `deleteMembers(db,
listId)`. `HitList` gains `members?: Member[]` (`{ user_id, username?, role, status }`, usernames from the `profiles`
mirror) set by `getHitLists` via one extra query; `useHitListsStore` keeps them on the list.

## Server (S8-02) — `supabase/migrations/20261025010000_shared_lists_s8.sql`, pgTAP `110-shared-lists-s8.test.sql`

`list_invitations()` → `setof (list_id uuid, name text, kind text, owner_id uuid, owner_username text,
owner_display_name text, role text, spot_count int, invited_at timestamptz)`, `security definer`, `set search_path =
''`, for `auth.uid()` only: the caller's `status = 'invited'` rows of live, shared lists whose owner hasn't blocked
them (and they haven't blocked the owner). `spot_count` = what a member would read: manual → live spots in
`hit_list_spots` with `hs.added_by = s.owner_id` and the adder the owner or a `'member'`; area → the owner's live,
located spots inside the circle that pass `spot_matches_filters`. No name, notes or coordinates of any spot. pgTAP
(RED first): stranger/anon get nothing; ana's invitee ben sees 'Downtown', 'ana', 'add', count 12; a spot ben can't
read (private, in the list by a member who left) isn't counted; after Join the row is gone; after Decline / Remove /
Stop sharing / list deleted it's gone; a block either way hides it; an area list's count matches the circle +
filters. `grant execute … to authenticated`.

`share_list(p_list uuid)` → the `hit_lists` row: owner only (else 42501), live list (else 42501); `update … set shared
= true, updated_at = greatest(updated_at, now())` and returns the row (a client `update({ shared, updated_at })` after
`stop_sharing` stamped the server's `now()` can lose to `skip_stale_update` on a phone whose clock is behind, 0 rows).
pgTAP: owner turns it on and gets the row with a new rev; a member, a stranger, a deleted list → 42501; after
`stop_sharing` it works again with members gone (t30_unshare).

## Data (S8-02) — `src/sync/lists.ts`

| Function | Server calls (in order) | Local after success |
|---|---|---|
| `shareList(db, client, uid, listId, friendIds, role)` | D85 check (list owned, no outbox row for it); if not shared: `rpc('share_list', { p_list })` (returns the row); then the invite insert below | `applyOwned` the returned list row **as soon as the rpc succeeds** (shared = 1, server rev; a failed insert then retries through `invite`), `upsertMembers` the invited rows, reload lists store |
| `invite(db, client, uid, listId, friendIds, role)` | `from('hit_list_members').upsert(friendIds.map(id => ({ list_id, user_id: id, role, status: 'invited', invited_by: uid })), { onConflict: 'list_id,user_id', ignoreDuplicates: true })` (an already-invited friend from a stale mirror is not a 23505; a blocked one's 42501 from `t05_block_guard` fails the batch → "Couldn't share. Try again.", not the 42501 copy) | `upsertMembers` |
| `setRole(db, client, uid, listId, userId, role)` | `from('hit_list_members').update({ role }).eq('list_id').eq('user_id').select('user_id')` (0 rows → throw) | `upsertMembers` |
| `removeMember(db, client, uid, listId, userId)` | `rpc('remove_member', { p_list, p_user })` | delete the mirror row; memberships of that member's spots in the list (`rev = -1` first) |
| `leave(db, client, uid, listId)` | `rpc('leave_list', { p_list })` | one transaction: memberships of the list (`rev = -1`, delete), the list's foreign spots that no other held live list shows (manual membership or a foreign area list's circle, as stopSharing) and their media, the list row, its mirror rows; then `deleteCachedPhotos(spotIds)` |
| `stopSharing(db, client, uid, listId)` | `rpc('stop_sharing', { p_list })`, then `from('hit_lists').select('*').eq('id', listId)` | `applyOwned` (shared = 0); one transaction: mirror rows, memberships whose spot isn't mine (`rev = -1`), foreign spots no other local list holds; cache files |
| `respondInvite(db, client, uid, listId, 'join' \| 'decline')` | join: `from('hit_list_members').update({ status: 'member' }).eq('list_id').eq('user_id', uid).select('*')`; decline: `.delete().eq('list_id').eq('user_id', uid)` | join: `upsertMembers`; the caller runs `syncNow` (the fill brings the list and its spots); a 0-row update (invitation withdrawn meanwhile) → `NotAllowedError`; decline: delete the mirror row; both remove the Inbox item; 'Open' after Join shows only once the list is held locally |
| `loadInvites(client, uid)` / `loadAndApplyInvites(db, client, uid)` | `rpc('list_invitations')` | Inbox kind `invite` (`setItems`), `useHitListsStore.invitations`; names into `profiles` (D72); engine runs it after `loadAndApplySends`, newest load wins (`createTickets()`) |
| `deleteCachedPhotos(spotIds)` (in `photos.ts`) | — | removes `Paths.cache/photos/<id>/` per spot |

rpc args are `p_list` / `p_user`. Errors: 42501 → `NotAllowedError` (copy: 'You can't do that in this list any more.'),
anything else rethrown with `serverError`.

## Pull (S8-02) — `src/sync/pull.ts`

Order inside `pull` (each step only after `maySync`; any failed read skips the removals that depend on it):

1. **Members mirror (full read, not by rev):** the server deletes member rows for real, so `rev` can't show a Leave,
   Remove or Decline. `from('hit_list_members').select('list_id, user_id, role, status, joined_at').order('list_id')
   .order('user_id').range(…)` pages of 1000 (RLS: every row of my lists, my own rows, rows of lists I joined). On
   success `replaceMembers`; then `from('profiles').select('id, username, display_name').in('id', …)` for member
   ids and foreign list owners → `upsertProfiles`, in chunks of `IDS_PER_QUERY`. On failure: `failed`, and steps
   4–5 don't remove anything. A member can't read an invitee's profile (`can_read_profile` needs both rows
   `'member'`): their row shows 'Invited rider'. Mirror and profile changes count in `PullResult.changed` so the
   member strip reloads.
2. **Tables by rev** (unchanged order spots, media, hit_lists, hit_list_spots) with three changes:
   - a foreign media row is inserted with `file_path = cache/photos/<spot>/<media>.jpg`;
   - a foreign `hit_lists` row is applied only when the mirror says `uid` is `'member'` of it (an invitee's row is
     skipped; the cursor still moves: the fill fetches it after Join, whatever its rev). **When step 1 failed** the
     table stops at its first foreign row and keeps the cursor there (a stale mirror never skips a list for good);
   - a media row whose spot isn't held is **skipped, not a stop**, when the row is foreign; a membership whose
     list or spot isn't held is **always skipped** (own lists and spots come earlier in FK order; a foreign parent is
     brought by the fill, step 3). Own media still stops the table as today (S5 ordering). This answers S5-04's "a
     row that can never be written stops its table for good".
3. **Per-list fill (S5 Left-for-S8 / S3-08 "readable rows not held, whatever their rev"):** for every list where the
   mirror says `uid` is `'member'` and whose owner ≠ uid: fetch the list row by id if not held. Then for every live
   **shared** list held (mine or theirs): manual → `from('hit_list_spots').select('*').eq('list_id', id)` (all its
   rows); area (foreign) → `from('spots').select('id').eq('owner_id', list.owner_id)` (RLS returns the readable
   ones). Both reads page with `.order('spot_id' | 'id').range(from, from + 999)` until a short page; a list whose
   pages didn't all arrive is neither filled nor reconciled this pull. Spots not held → `from('spots').select('*')
   .in('id', chunk)` → `applyOwned`, then `from('media').select('*').in('spot_id', chunk)`; then insert the missing
   memberships. One request per shared list per pull (more past 1000 rows) plus fetches for what's missing
   (`IDS_PER_QUERY` 100).
4. **Memberships reconciliation** extends from owned lists to every live list held whose owner is set: the rows the
   step-3 read returned (shared) or the existing per-list `in` query (private) are the truth; a local row not among
   them, with no outbox row, goes (`rev = -1`, delete). In a list the rider **doesn't own**, a *parked* outbox row
   doesn't protect it (a view-only add the server refused, 42501): the membership and its parked row go once the
   read confirms the server hasn't got it (S8-07's "the outbox row records it" holds until that pull).
5. **List reconciliation (new):** a foreign list goes (memberships `rev = -1` + delete, mirror rows, list row) when the
   mirror read succeeded and says `uid` isn't `'member'` (left, removed, unshared, declined) or its row is deleted.
6. **Readable spots** (existing `reconcileReadableSpots`) now also returns the removed ids; `PullResult` gains
   `removedSpotIds?: string[]`; the engine calls `deleteCachedPhotos(removedSpotIds)` after the pull. Its membership
   DELETE (`pull.ts:360`) sets `rev = -1` first: under the new delete rule an unreadable foreign spot in **my** list
   would otherwise queue a server DELETE.
7. **Foreign photos (new):** a soft-deleted photo never reaches a member (`media_select` needs `deleted_at is null`,
   so rev pull can't bring the delete). For held foreign spots, `from('media').select('id').in('spot_id', chunk)`;
   a local foreign media row not returned goes with its cache file, and a `primary_photo_id` naming it is cleared
   (pull write, server rev untouched: the next spot pull sets it anyway). Only after every chunk read and with the
   session live.

The session-ended guard (`signedInAs`) stays in front of every removal.

## Read-only others (S8-03) — D47

- `getSpots` already returns `owner_id`. `selectMySpots(spots, uid)` (spots store, pure) = `owner_id` undefined or
  `uid`; the Spots tab's 'My spots' chip (the default) uses it; a list chip shows the list's spots whoever owns them
  (`selectListSpots` unchanged for manual lists).
- `selectAreaSpots(list, spots, …)` keeps only spots with the list's owner (`(spot.owner_id ?? null) === (list.owner_id
  ?? null)`): a member's own spots inside ana's circle never show in ana's area list, and a friend's pulled spots never
  show in mine (the server's area rule is the owner's spots).
- **Detail of a foreign spot** (`app/spot/[id]/index.tsx`): under the title '@ana's spot' (name from the profiles
  mirror, 'A friend's spot' when unknown), no Edit, no Send (S7), no photo-grid add tile, the 'In lists' row is
  plain text of the lists that hold it (no chips, no '+ Add to hit list'), and a **Save a copy** button. The viewer
  (`photos.tsx`) has no long-press menu for a foreign spot.
- **Save a copy** → `Alert('Save a copy of this spot?', 'It becomes your own private spot.', Cancel / Save)` →
  `saveCopy(db, client, uid, spotId)` (`src/sync/copy.ts`): download any photo whose cache file is missing
  (`cachedPhotoUri`), then insert an owned spot (fresh `newId()`, owner `uid`, `from_username` = the owner's username
  (null when unknown), `copied_from_send` null, same name, feature_types, stopped, natural_speed, notes,
  location, generated_name; new `created_at`/`updated_at`) through `insertSpot`, copy each cached file to
  `Paths.document/photos/<newId>/<newMediaId>.jpg` and `insertMedia` it (owned, so the triggers queue them),
  primary photo mapped; resolves `{ spotId, missingPhotos }` (D89). Then `router.replace('/spot/<newId>')` and a toast
  'Saved a copy' (+ " · 1 photo couldn't be copied").
- `useSpotActions.updateSpot`/`removeSpot`/`setPrimaryPhoto` and `useMediaActions.savePhotos`/`removePhoto` reject
  with `new Error('not your spot')` for a foreign spot (store untouched, nothing written).
- Owner badge: `SpotListItem` takes `ownerLabel?: string` ('@ana', small grey text after the name); `SpotMap`'s Marker
  `description` ends with ' · @ana'. `SpotsBrowser` computes the label from the profiles names for foreign spots.
- **Every other place that offers or writes a spot takes `selectMySpots`** (Opus plan review): Quick Add's
  'Already have this spot?' (`app/add/review.tsx:56`) and import's 'Add photos to <name>' (`app/import/review.tsx:78`)
  `nearbySpots`; the area picker's count, 'Just these N' and Send; the select bar's 'Add to list (N)' (a foreign spot
  never goes into a list from this phone: the insert trigger wouldn't queue it, reconciliation would remove it, and
  after adoption `adoptableMemberships` would queue it into a 42501 park); `backfillTowns` (`use-db-init.ts:67`,
  else it writes foreign rows and sends their coordinates to Apple). `useSpotActions.setTown` rejects a foreign spot;
  `useHitListActions` rejects rename/update/delete of a foreign list ('not your list') and `addSpots` of foreign spots.
- S7 entry points (S7-08 proposed change): the select bar's 'Send (N)', a list's 'Send these spots' and the area
  picker's 'Send these N spots' pass only the rider's own spots; the list subtitle counts them ('one-time copy of
  10 spots'); hidden when it's 0 (D87).
- **Sign-out** (Keep or Remove) and `releaseAccountData` remove foreign rows and the whole `Paths.cache/photos`
  folder (D86): `removeForeignRows(db, uid)` in `adopt.ts` (one transaction, `user_id` cleared first as today). An
  account switch (`deleteAccountRows`) also empties `hit_list_members` and `Paths.cache/photos` (`deleteSpotPhotos`
  only touches `Paths.document`).

## Photos (S8-03) — `src/sync/photos.ts`, `src/hooks/use-photo-uri.ts`

- `cachedPhotoUri(client, media)`: `media.file_path` starts with `cache/` → if `Paths.cache/photos/<spot>/<media>.jpg`
  exists return its uri; else `client.storage.from('photos').download('<media.owner_id>/<spot>/<media>.jpg')`, write
  the bytes (`blobBytes`) to that file, return its uri. One download per media id at a time (module `Map<id,
  Promise>`). A download error (403/404/offline) rejects; nothing is written. Owned media → `resolvePhotoUri`.
- `resolvePhotoUri(filePath)` gains the cache branch (`cache/…` → `new File(Paths.cache, rest).uri`); unchanged for
  `photos/…` and absolute uris. `defaultPhotoIO.write` makes the folder under the same root `resolvePhotoUri` picks
  (`photos.ts:78` hard-codes `Paths.document` today); `cachedPhotoUri` writes through an injected `PhotoIO` so the
  integration test's node IO works.
- `usePhotoUri(media)` → `{ uri?: string, failed: boolean }`: owned → the sync uri at once; foreign → the cached uri
  or a download through `cachedPhotoUri(getSupabase(), …)`. Used by `PhotoGrid` tiles, `SpotListItem`'s thumbnail,
  the viewer pages and `SendSheet`/`PickSpotsSheet` thumbnails (owned only there). A failed one renders the
  placeholder tile (`testID 'photo-placeholder'`); a later mount tries again (no retry loop).
- Removal: `deleteCachedPhotos(spotIds)` from Leave, Stop sharing, pull removals, sign-out (whole folder).

## Share screens (S8-04)

**`src/components/ShareListSheet.tsx`** (`{ listId, mode: 'share' | 'invite', onClose }`, mounted per open, like
`SendSheet`): signed out → 'Sign in to share hit lists' + 'Sign in'; no friends → 'Add a friend first' + link to
`/friends`; friends with checkboxes ('@ana', display name under it); friends already in the list show 'In the list' /
'Invited' and no checkbox; a `SegmentedControl` 'Can add spots' (default) / 'View only' (one role per batch, D88); the
D34 sentence; in share mode the count line ('12 spots will become visible to them', 'One spot …', none at 0); an area
list adds 'They'll see your spots inside this area, now and later'; **Share** (invite mode: **Invite**) disabled until a
friend is checked; single-flight ref; first `syncNow` then `shareList`/`invite`; D85 refusal line; success → toast
'Shared Downtown with @ana' / 'Invited @ana' and close. Can't close while the server call runs.

**List screen** (`app/list/[id]/index.tsx`): `ShareListSlot` becomes **Share list** (two-people icon, subtitle 'live:
they'll see new spots too'), owner only, beside 'Send these spots · one-time copy of 12 spots'; on a shared list the
owner's button reads **Invite** (same subtitle) and opens invite mode. A shared list shows the **member strip** under
the title: initials circles for the owner then each `'member'` (max 5 + '+2'), the count (D84), and '+ Invite' (owner
only); pressing the strip pushes `/list/<id>/members`. A member sees no Rename, no Delete list, no Edit area, no Share;
'Remove from list' on long press only for their own spots (D42; view-only: never); the owner keeps it for any spot.

**`app/list/[id]/members.tsx`** (registered `title: 'Members'`): rows '@ana (owner)', '@ben · Can add spots', '@cal ·
View only', an 'Invited' tag on invited rows. Owner: tapping a member row → `Alert('@ben', undefined, ['Can add spots',
'View only', 'Remove from list' (destructive), 'Cancel'])` → `setRole` / `Alert('Remove @ben?', "Their 5 spots in
Downtown will leave it too.")` → `removeMember`; an invited row offers 'Withdraw invitation' (→ `removeMember`);
A member row of someone who isn't a friend offers 'Add friend' (§3.5, `addFriend` by id → S6 request). Members see
invited rows only as 'Invited rider' (no profile read). **Stop sharing** at the bottom → `Alert('Stop sharing Downtown?', 'Members lose access to all 12 spots now.', Cancel /
Stop sharing)` → `stopSharing` → back to the list. Member: no menus; **Leave list** → `Alert('Leave Downtown?', 'Your 5
spots in Downtown will leave it too.' (omitted at 0; the message is then undefined), Cancel / Leave)` → `leave` →
`router.dismissAll()` then the Lists tab. Signed out: the sign-in line.

Deleting a **shared** list (owner): the existing confirm gains 'Members lose access to all 12 spots now.'

## Markers (S8-05)

`SharedBadge` (`src/components/SharedBadge.tsx`): `IconSymbol 'person.2.fill'` (testID `icon-person.2.fill`) + the
count, `accessibilityLabel 'Shared with 4'`. Rendered for a list with `shared` true on: Lists tab rows (both sections),
`ListPickerChips` chips, the detail 'In lists' chips, `AddToListSheet` rows. Never on a private list. The list screen's
action row holds 'Share list · live: they'll see new spots too' next to Send (S8-04).

**Lists tab** (`app/(tabs)/lists.tsx`): 'My hit lists' (owned or phone-only, as today, with the badge when shared),
then **'Shared with me'** (`selectSharedWithMe(lists, members, uid)`: owner set and ≠ uid, my mirror row `'member'`):
row 'Downtown', '@ana · 12 spots' and the badge; and invitations (S8-06) with 'Join'. The section is hidden when empty;
signed out it isn't shown.

## First-add confirmation (S8-05)

`AddToListSheet` and the select bar's 'Add to list': checking a **shared** list (mine or theirs) the first time on
this phone → `Alert('Everyone in Downtown (4) will see this spot.' / '… these 3 spots.', undefined, Cancel / Add)`; Add
→ `addSpotsToList` and `setSyncState(db, 'confirmed_list:<id>', '1')`; the next add to that list asks nothing; another
shared list asks again (D90). `forgetAccount` clears `confirmed_list:%` too. Rules in the sheet: a shared list I own or
where my role is 'add' is enabled; role 'view' → disabled row with hint 'View only'; an area list (mine or shared) →
disabled with 'Area list: spots inside the circle are in it' (S2's hint); a foreign spot never opens the sheet.

## Shared area lists (S8-05)

A member sees the owner's spots inside the circle that the pull brought (server `can_read_spot` area branch);
`selectAreaSpots` with the owner rule above; the list screen shows 'Area · 2 mi of Capitol Hill' and no 'Edit area'
for a member; Members can't add (D41); the per-list fill re-reads an area list's readable ids every pull, so a circle
or filter edit by the owner shows on the next sync.

## Inbox invitations (S8-06)

`InviteItem extends InboxItemBase { kind: 'invite'; listId; listName; ownerId; ownerUsername?; spotCount; role }` (id
= listId, `created_at` = `invited_at`), added to the `InboxItem` union (the tab's `never` check forces the case).
Section **'Invitations'**: '@ana invited you to Downtown (12 spots)' ('(1 spot)', '(no spots yet)'), 'Join' (single-
flight per list: `respondInvite(…, 'join')` → `syncNow` → line 'Joined Downtown' with 'Open' pushing `/list/<id>`) and
'Decline' (`Alert('Decline the invitation to Downtown?', undefined, Cancel / Decline)`). Long press: Block (S6
`confirmBlock`). The badge counts unseen invites (no store change: `selectUnseenCount` counts every kind). The Lists
tab's 'Shared with me' shows each invitation with a 'Join' chip calling the same action.

## Copy table

| Where | Text |
|---|---|
| Share sheet title | 'Share Downtown' / invite mode 'Invite to Downtown' |
| Share sheet, D34 | 'Everyone here sees every spot in Downtown — including spots added later — until you remove them or stop sharing.' |
| Share sheet, count | '12 spots will become visible to them' / 'One spot will become visible to them' |
| Share sheet, area | "They'll see your spots inside this area, now and later" |
| Share sheet, roles | 'Can add spots' / 'View only' |
| Share sheet, signed out | 'Sign in to share hit lists' + 'Sign in' |
| Share sheet, no friends | 'Add a friend first' + 'Find friends' |
| Share sheet, not backed up (D85) | "This list isn't backed up yet. Try again when you're online." |
| Share sheet, server error | "Couldn't share. Try again." |
| Toasts | 'Shared Downtown with @ana' / 'with 2 friends' · 'Invited @ana' · 'Saved a copy' · 'Left Downtown' · 'Stopped sharing Downtown' |
| List action | 'Share list' + 'live: they'll see new spots too' (owner, private) · 'Invite' + same subtitle (owner, shared) |
| Member strip | initials, '4', '+ Invite' (owner) |
| Members screen | '@ana (owner)', '@ben · Can add spots', '@cal · View only', 'Invited', 'Stop sharing', 'Leave list' |
| Role menu | 'Can add spots' / 'View only' / 'Remove from list' / 'Cancel'; invited: 'Withdraw invitation' |
| Remove confirm | 'Remove @ben?' + 'Their 5 spots in Downtown will leave it too.' |
| Leave confirm | 'Leave Downtown?' + 'Your 5 spots in Downtown will leave it too.' (omitted at 0) |
| Stop confirm | 'Stop sharing Downtown?' + 'Members lose access to all 12 spots now.' |
| First add | 'Everyone in Downtown (4) will see this spot.' / '… these 3 spots.' · Cancel / Add |
| Add-to-list hints | 'View only' · S2's area hint |
| Foreign detail | "@ana's spot" (fallback "A friend's spot") · 'Save a copy' |
| Save a copy confirm | 'Save a copy of this spot?' + 'It becomes your own private spot.' · Cancel / Save |
| Inbox | '@ana invited you to Downtown (12 spots)' · 'Join' · 'Decline' · 'Joined Downtown' + 'Open' · section 'Invitations' |
| Lists tab invitation (S8-06) | 'Downtown' · '@ana invited you · 12 spots' · 'Join' · toast 'Joined Downtown' / 'This invitation was withdrawn.' |
| Lists tab | 'Shared with me' · '@ana · 12 spots' · 'Join' |
| Not allowed (42501) | "You can't do that in this list any more." |
| Members screen, extra | 'Invited rider' (a member's view of an invited row) · 'Add friend' · 'Withdraw invitation' |
| Delete a shared list | the S1 confirm + 'Members lose access to all 12 spots now.' |

## Integration test design (S8-07) — `src/__integration__/shared-list.test.ts`

Riders A, B, C (friends pairwise via the S6 rpc), one node:sqlite DB each (`phones.ts`), `nodePhotoIO`, a node cache
dir for `cachedPhotoUri` (inject `PhotoIO` + cache root). A: 5 spots with photos in list L, `pushAll`. A `shareList(L,
[B], 'add')` + `invite(L, [C], 'view')`. B and C `pullAll` + `loadInvites` → one invite each with spotCount 5. Both
`respondInvite('join')`, `pullAll` → B: L in `selectSharedWithMe`, 5 foreign spots, `cachedPhotoUri` bytes equal
`FIXTURE`. A adds a 6th spot (new) and puts an **old** own spot not in L into L (old rev), pushes; B pulls → 7 (the
fill). B adds own spot to L, push succeeds; A pulls → 8 with B's spot readable. C adds own spot, push → outbox row
parked with 42501. B `leave` → B's DB has no L, none of A's spots, cache folder gone; `cachedPhotoUri` of one of A's
media (re-inserted row in a scratch DB) rejects. A pulls → B's spot gone from L (D43). A `stopSharing` → C pulls → L
and A's spots gone. Also: A `removeMember(C)` path in a second case; an invite after unfriending gone. Run: `npx
supabase start`, `npm run db:reset`, `npm run test:db`, `npm run test:integration`, `npx supabase stop`; record
counts here; `docker ps --format '{{.Names}}'` shows no `supabase_*`.

## Test list per feature (RED first, file → cases)

**S8-02**
- `db-migrate.test.ts`: `MIGRATIONS` length 8; v7 → v8 creates `hit_list_members`; migrations 1–7 untouched (the
  existing per-version cases); the recreated triggers: B's own spot added to A's (foreign, owned) list queues an
  upsert; the owner removing B's spot from their list queues a delete; a pull write (rev set) queues nothing; a
  phone-only list queues nothing.
- `db-hit-lists.test.ts`: `addSpotsToList` writes `added_by`; `upsertMembers`/`replaceMembers`/`getMembers`/
  `getMyMemberships`/`deleteMembers`; `getHitLists` attaches members with usernames from `profiles`.
- `sync-lists.test.ts` (fake client + real SQLite + fake fs): the feature step's calls in order with `invited_by`;
  D85 refusal (no call); a returned 0-row update throws and writes nothing; `shared` written with the server rev and
  no outbox row; `invite` one insert; `setRole` update; `removeMember` rpc + local rows; `leave` rpc then list,
  memberships, foreign spots, media, mirror rows gone in one transaction, own spots stay, cache dirs removed;
  `stopSharing` rpc + re-read; `respondInvite` join update / decline delete; every function with no session makes no
  call; 42501 → `NotAllowedError`.
- `sync-pull.test.ts`: members full read replaces the mirror (a removed row goes); a failed members read removes
  nothing; foreign media get `cache/photos/…`; an invitee list row is skipped; a membership whose foreign spot is
  missing is skipped and the fill fetches the spot + media + membership; a joined list with old revs is fetched by
  the fill; foreign area list fill by owner; memberships of a shared foreign list reconciled; a list I left is
  removed with its memberships and foreign spots; `removedSpotIds` returned; session-ended → nothing removed; an
  unreadable foreign spot in my list queues nothing; a 1000+ row list is paged and a cut-off read removes nothing;
  a parked view-only membership goes with its parked row once the server read lacks it; with the members read
  failed the `hit_lists` table stops at a foreign row; a foreign photo deleted on the server goes with its cache file
  and the primary is cleared; `changed` is true for a mirror-only change.
- `supabase/tests/110-shared-lists-s8.test.sql` (pgTAP, the cases under Server: `list_invitations`, `share_list`).
- `hit-lists-store.test.ts`: `selectSharedWithMe`, `selectInvitations`, `members` kept on reload.
- `inbox-store.test.ts`: `setItems(uid, 'invite', …)`, badge counts unseen invites.

**S8-03**
- `stores.test.ts`: `selectMySpots`; `selectAreaSpots` owner rule (mine in ana's circle excluded, ana's included in
  her list, never in mine).
- `spots-view-mode.test.tsx`: foreign spot absent under 'My spots', present under the shared list chip.
- `spot-detail.test.tsx`: the feature step's foreign cases; Save a copy alert; `saveCopy` called; `router.replace`.
- `sync-copy.test.ts`: owned copy with `from_username`, fields kept, photos copied from cache into
  `Paths.document/photos/<newId>/`, outbox rows queued, a missing download → `missingPhotos: 1`.
- `use-spot-actions.test.tsx`, `use-media-actions.test.tsx`: 'not your spot' rejections, nothing written.
- `components.test.tsx` (`ownerLabel`), `spot-map.test.tsx` (' · @ana').
- `sync-photos.test.ts`: `cachedPhotoUri` download + write, second call cached, concurrent calls one download,
  reject on 403; `photo-storage.test.ts`: `cache/` branch, owned unchanged; `photo-grid.test.tsx`: a rejecting
  resolver shows `photo-placeholder`.
- `spots-select.test.tsx`, `list-screen.test.tsx`, `area-picker.test.tsx`: Send entry points pass own spots only.
- `adopt.test.ts`: sign-out Keep removes foreign rows and the cache folder; own rows stay; an account switch empties
  `hit_list_members` and the cache.
- `quick-add.test.tsx`, `import-review.test.tsx`, `area-picker.test.tsx`, `use-db-init.test.tsx`,
  `use-hit-list-actions.test.tsx`: foreign spots never offered/backfilled; foreign list writes reject.

**S8-04**
- `share-list-sheet.test.tsx`: the feature step's cases, invite mode (members excluded), D85 line, single-flight,
  source file has no `/\bsend/i`, no render contains it.
- `list-screen.test.tsx`: both actions in one render with subtitles; member strip (count D84, initials, '+ Invite'
  owner only); press → `/list/<id>/members`; member sees no Rename/Delete/Share; Remove from list rules.
- `list-members.test.tsx`: the feature step's owner/member cases, invited tag, Withdraw invitation, Remove confirm
  copy, Leave at 0 (no message), `router.dismissAll`; source has no `/\bsend/i`.

**S8-05**
- `lists-tab.test.tsx`, `list-picker-chips.test.tsx`, `spot-detail.test.tsx`, `add-to-list-sheet.test.tsx`: badge in
  shared, absent in private; Shared with me section; sheet rules, first-add alert, flag set, second add silent,
  another list asks again.
- `hit-lists-store.test.ts`: area list owned by ana → only ana's spots; list screen as member: area label, no Edit
  area.

**S8-06**
- `inbox-tab.test.tsx`: invite row copy (12 / 1 / 0 spots), Join → `respondInvite` → `syncNow` → 'Joined Downtown' +
  Open, Decline confirm, double tap joins once; `lists-tab.test.tsx`: Join chip.

**S8-07** — `src/__integration__/shared-list.test.ts` (above).

## Review focus (S8-09)

Foreign writes (every `updateSpot`/`removeSpot`/media/send path), the trigger rewrite (no echo, no foreign queue,
view-only), pull removals only after a successful read and a live session, leave/stop in one transaction, cache under
`Paths.cache` only and removed with the rows, D34 copy greps, the invitee row skip, the count rule (D84).

## D83–D91 (spec §2, asked in §9 Q44–Q52)

- **D83** *default*: an invitee sees the list's name, owner and spot count ('(12 spots)') but no spots until Join;
  the count comes from `list_invitations()` (RLS gives an invitee no spot rows).
- **D84** *default*: the member count shown is joined members + the owner; invitations are listed on the members
  screen with 'Invited' but not counted.
- **D85** *default*: sharing needs the list backed up: the sheet syncs first and refuses with a line if the list
  still waits in the outbox (its spots may still be uploading; they appear for members as they arrive).
- **D86** *default*: others' spots and their cached photos leave the phone when you sign out (Keep keeps only yours)
  and when another account signs in.
- **D87** *default*: Send never sends someone else's spot onward: from a shared list (or a selection) it sends only
  your own spots, and the subtitle counts them.
- **D88** *default*: one role per Share/Invite batch (the segmented control); change a member's role afterwards on
  the members screen.
- **D89** *default*: Save a copy downloads the photos first; any that can't be downloaded are left out and the toast
  says so.
- **D90** *default*: the first-add confirmation is once per shared list per phone (also for the owner); signing in as
  another account asks again.
- **D91** *default*: others' photos download when first shown and live in the iOS cache (iOS may clear it; they
  download again); no prefetch; offline and not cached → a grey placeholder tile.

## Proposed changes to later feature steps

- S8-02 step 1: migration 8 also recreates `hit_list_spots_outbox_ins`/`_del` (member adds/removes must queue; see
  Migration 8) and `addSpotsToList` writes `added_by` — the step's "nothing else" would leave S8-07's "B adds a spot
  … push succeeds" impossible.
- S8-02 step 2: the member insert carries `invited_by: uid` (the RLS insert policy requires it); `shareList` updates
  `updated_at` too and writes the returned row (server rev, no outbox echo); signatures are `(db, client, uid, …)`.
  The pull of `hit_list_members` is a full read, not by rev (server deletes are real).
- S8-02: add 'the server migration `20261025010000_shared_lists_s8.sql` (`list_invitations()`) and pgTAP
  `110-shared-lists-s8.test.sql` pass (`npm run test:db`, RED first)' — the Inbox's '(12 spots)' needs it (D83).
- S8-02 step 3: invitations come from `list_invitations()` (`loadAndApplyInvites`), not from the table pull; the
  hit-lists store keeps `invitations`; `selectSharedWithMe(lists, members, uid)` takes the mirror.
- S8-03 step 5: `cachedPhotoUri(client, media)`; foreign `file_path` is `cache/photos/<spot>/<media>.jpg` so
  `resolvePhotoUri` knows the cache without an owner check; the photo-grid test drives `usePhotoUri`.
- S8-03: add `selectAreaSpots`' owner rule, the S7 entry-point filter (D87) and sign-out removing foreign rows (D86).
- S8-07: 'B adds a spot of their own' passes only with the trigger change above; add the old-rev spot case (fill).
- S8-02 step 2: `shareList` turns sharing on with the new `share_list` rpc instead of
  `from('hit_lists').update({ shared: true })` (stale guard, plan review #7), and `invite` upserts with
  `ignoreDuplicates`; a test may still assert the member rows' fields.
- S8-03: add the plan review #4 guards (Quick Add/import offers, area picker, Add to list, town backfill,
  `useHitListActions`) and pull step 7 (foreign photo deletes).

## Plan review (S8-01, Opus, before any code)

An Opus reviewer read this plan against the server migrations, `pull.ts`, `push.ts`, `schema.ts`, `photos.ts`,
`adopt.ts` and the feature list. Every finding below is folded into the sections above (I checked the cited lines).

| # | Severity | Finding | Taken into |
|---|---|---|---|
| 1 | Important | `reconcileReadableSpots`' membership DELETE (`pull.ts:360`) has no `rev = -1`; under the new delete rule it would queue a server DELETE for an unreadable foreign spot in my list | Pull step 6; test "unreadable foreign spot in my list queues nothing" (S8-02) |
| 2 | Important | an owner's deleted photo never reaches a member (`media_select` hides deleted rows): stale cached photo shown forever | Pull step 7 |
| 3 | Important | fill/area reads unpaged: PostgREST's 1000-row cap would make step 4 delete real memberships and re-add them every pull | Pull step 3 paging; reconcile only fully read lists |
| 4 | Important | foreign spots reachable through Quick Add/import 'Add photos there', area picker, select bar Add to list, `backfillTowns`; no guard in `useHitListActions`/`setTown` | Read-only others (first bullet) |
| 5 | Important | a parked membership in someone else's list stays forever ("1 change not backed up") because `NO_OUTBOX_ROW` counts parked rows | Pull step 4 |
| 6 | Important | skip rule ambiguous for a membership whose list isn't held; a stale mirror moves the `hit_lists` cursor past a list for good | Pull step 2 |
| 7 | Minor | client `update({ shared, updated_at })` can lose to the stale guard after `stop_sharing`'s server `now()` | `share_list(p_list)` rpc in the S8 server migration; local shared written at once |
| 8 | Minor | invite insert all-or-nothing: 23505 on an already-invited friend, block guard 42501 mapped to the wrong copy | `invite` upsert `ignoreDuplicates`, copy |
| 9 | Minor | Join on a withdrawn invitation returns 0 rows silently | `respondInvite` row |
| 10 | Minor | `changed` must count mirror/profile changes; account switch must clear members + cache; Leave deleted foreign spots another list still shows | Pull step 1, Read-only others, Leave row |
| 11 | Minor | `PhotoIO.write` makes the folder under `Paths.document` (`photos.ts:78`) | Photos |
| 12 | Minor | §3.5 friend request from a member row; members can't read invitees' profiles; delete of a shared list needs a consequence line; profiles read needs chunking | Members screen, Pull step 1, list delete confirm |

Checked by the reviewer and holding: the members insert with `invited_by`, `setRole`, Join/Decline, the three rpcs
and the re-read after `stop_sharing` pass RLS and `guard_member_update`; `downloadMissingPhotos` skips foreign rows
(`photos.ts:131-132`); push parks 42501 (`push.ts:33`); the new trigger rule fits adoption's `enqueueMemberships`.

## As built (S8-02)

- **Migration 8** as planned (table + index, the two membership triggers recreated with the member rule; literal SQL
  in `schema.ts` `migration8`). `addSpotsToList(db, listId, spotIds, addedAt, addedBy)`; `useHitListActions` passes
  `currentOwnerId()`. `src/db/hit-lists.ts`: `upsertMembers`, `replaceMembers` (→ changed?), `getMembers`,
  `getMyMemberships`, `deleteMembers`, `deleteMember`; `getHitLists` attaches `members` (joined first, usernames from
  `profiles`), `HitList.members?: HitListMember[]`; types `ListMember`, `MemberRole`, `MemberStatus`.
- **Server** `20261025010000_shared_lists_s8.sql` (`list_invitations()`, `share_list(p_list)`; execute revoked from
  public/anon, granted to authenticated) and pgTAP `110-shared-lists-s8` (24 cases). RED: `test:db` failed 110 with
  "function public.list_invitations() does not exist"; GREEN: Files=11, Tests=628, PASS; stack stopped, no
  `supabase_*` container left.
- **`src/sync/lists.ts`** as the Data table, every call `(db, client, uid, …)` resolving `false` without `maySync`.
  Errors: `NotAllowedError` (42501), `ListNotBackedUpError` (D85: not the rider's, phone-only, or an outbox row).
  `respondInvite('join')` with 0 rows also drops the mirror row (the invitation is gone). Local multi-row removals go
  through `src/sync/shared-rows.ts` (`forgetList` also drops the list's membership outbox rows: the server took the
  rider's spots out with them, D43; `unshareLocally`, `removeMemberLocally`, `removeUnheldForeignSpots` = others'
  spots no live list and no shared area list of their owner shows) inside `runExclusive` + one transaction; cache
  folders after the commit (`deleteCachedPhotos`, `deleteCachedFiles` in `photos.ts`; `cachedPhotoPath`).
- **Pull** steps 1–7 as planned, with one refinement of step 2: a membership whose list/spot isn't held, or someone
  else's photo whose spot isn't, is **skipped only when every earlier table was read to its end**; while one stopped
  or failed it still stops (else a row could be skipped past for good). `PullResult` gains `removedSpotIds` and
  `removedPhotoPaths`; the engine deletes their cache files and runs `loadAndApplyInvites` after the sends load.
  `memberFromServer` and `applyListRow` are exported for `lists.ts`.
- **Stores:** `selectSharedWithMe(lists, uid)`; `selectInvitations(items)` reads the **Inbox items** (kind
  `invite`) rather than a copy in the hit-lists store (one source, emptied on every rider change already). Inbox
  `InviteItem` + `inviteLine` ('@ana invited you to Downtown (12 spots)' / '(1 spot)' / '(no spots yet)'); the tab
  renders it as that line only until S8-06 adds Join / Decline.
- **Done early from S8-03 (D86 part):** an account switch, Remove and Keep-after-Delete empty `hit_list_members` and
  delete the removed spots' cache folders. Sign-out Keep removing others' rows is still S8-03.
- Tests: 1684 → 1756 (`check.sh` green); RED-first counts are in each commit message.

### S8-02 review (Opus, diff 5792dba..29015e0)

The reviewer checked every hard delete of `hit_list_spots`/`spots`/`hit_lists` against the migration 8 triggers (none
echoes), no `removeLocally` from inside a queue task, and `list_invitations`/`share_list` (definer, search_path,
grants, count = `can_read_spot`).

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | Important | media `in('spot_id', 100 ids)` reads unpaged: past 1000 rows the photo check deletes real photos, the fill misses some | fixed: paged `order('id').range()`, nothing removed after a cut-off page (RED test) |
| 2 | Important | a deleted shared list keeps its member rows: fill fetched it back every pull, reconcileLists deleted it again | fixed: the fill skips deleted rows (RED test: the third pull reports no change) |
| 3 | Minor | the fill re-asks and warns every pull for memberships whose spot is unreadable | fixed: skipped quietly (RED test) |
| 4 | Minor | invitation ticket taken after awaits: an answered invitation could reappear until the next load | fixed: ticket right after the server call, `isNewest` re-checked before `setItems` |
| 5 | Minor | a Join (or invite/setRole) landing mid-pull is undone by that pull's stale members read until the next sync | left for S8-09: converges on the follow-up sync; fix = run the post-call mirror writes on `runExclusive` |
| 6 | Minor | `invite` wrote 'invited' over a known row the server ignored (ignoreDuplicates) | fixed: known rows left as they are (RED test) |
| 7 | Minor | an account switch keeps the new rider's rows with `cache/` paths: `downloadMissingPhotos` never moves them | left for S8-03 (D86 sign-out/switch work): re-path `cache/` media of the kept rider to `photos/` |
| 8 | Minor | `removeLocally` uses `withTransactionAsync` during normal use (CLAUDE.md exception is for adopt) | left for S8-09: the plan asks for one transaction (Global constraints); either document the exception or split into idempotent single statements |
| 9 | Minor | pgTAP 110 covers only invitee-blocks-owner | left for S8-07 (stack run): add an owner-blocks-invitee case |

## As built (S8-03)

- **Whose spot:** `isForeign(row, uid)` / `ownerLabel` in `src/utils/ownership.ts` (pure); `riderId()` (src/sync/owner.ts)
  and `useRiderId()` = the signed-in rider, else the **phone's account** (`sync_state.user_id` → sync store
  `phoneUserId`, loaded by `useDbInit` and every `reloadStores`), so others' spots stay read-only on an offline launch
  or after a session ended (review #1). `assertOwn(row, 'spot' | 'list')` throws 'not your spot' / 'not your list'.
- **Stores:** `selectMySpots(spots, uid)` (uid null → all); an area list holds a spot when either side is phone-only or
  both owners match (looser than the plan's strict equality: a list made signed out after Keep still shows the kept
  spots; review #5 left for S8-09). `getSpots`/`getSpot` read `owner_username` from the profiles mirror (never stored,
  not in `SpotUpdate`).
- **Guards:** `useSpotActions` update/setTown/remove, `useMediaActions` save/remove, `useHitListActions`
  rename/update/delete (lists) and addSpotsToList (spots) reject before touching the store. Quick Add / import
  nearby offers, the area picker, the select bar (Send/Add to list take own spots; the header counts every checked
  row), a list's 'Send these spots' (own only, counted, hidden at 0, D87) and the launch town backfill (phone
  account's own) use `selectMySpots`.
- **Detail / viewer:** '@ana's spot' (or "A friend's spot") under the title, empty header, no Add photos tile,
  'In lists' as plain text, **Save a copy** (Alert → `saveCopy` → `router.replace` + toast 'Saved a copy' /
  "· 1 photo couldn't be copied" / "Couldn't save a copy"; signed out → `/auth/sign-in`). The viewer has no options
  for a foreign spot.
- **`src/sync/copy.ts`** `saveCopy(db, client, uid, spotId, io = defaultCopyIO)` → `{ spotId, missingPhotos }`;
  refuses unless `currentOwnerId() === uid` (review #4) and unless the spot is another rider's.
- **Photos:** `resolvePhotoUri` maps `cache/…` to `Paths.cache`; `photoFolder(filePath)`; `defaultPhotoIO.write`
  makes the folder under the right root; `cachedPhotoUri(client, media, io)` single-flight per media id, rejects on
  any download error, and writes nothing when a cache delete ran meanwhile (generation counter, review #6);
  `usePhotoUri(media | undefined)`; `PhotoGrid` tiles, `SpotsBrowser` rows (`SpotRow`) and viewer pages
  (`ViewerPhoto`) use it; a failed tile shows `photo-placeholder`. `'photo': 'image'` in the icon MAPPING.
- **Sign-out (D86):** Keep = server sign-out, then `removeForeignRows(db, uid)` (runExclusive + one transaction:
  `forgetList` per foreign list, memberships at rev -1, foreign media/spots, cursors restart; whole `Paths.cache/photos`
  after the commit); it resolves null and removes nothing while a change waits. Sign out anyway leaves others' rows
  (read-only through the phone account). An account switch re-paths the new rider's `cache/` media to `photos/`
  (S8-02 review #7).
- Tests 1760 → 1808; every change RED first (counts in the commit messages).

### S8-03 review (Opus, diff 98cbf78..cd1d35a)

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | Important | read-only checks used only the auth `userId`: offline launch / ended session made others' spots editable | fixed: `riderId()`/`useRiderId` fall back to the phone's account (RED: 4 cases) |
| 2 | Important | `removeForeignRows` on Sign out anyway dropped pending membership changes (forgetList) | fixed: refuses while a change waits; Sign out anyway doesn't call it (RED) |
| 3 | Minor | removal before the server sign-out: a sync could pull the rows back | fixed: server sign-out first (RED) |
| 4 | Minor | `saveCopy` owner = auth uid while adoption pending: copy never queued | fixed: refuses until `currentOwnerId() === uid` (RED) |
| 5 | Minor | area owner rule looser than the plan (phone-only rows during the adoption window) | left for S8-09: strict rule would hide kept spots in a list made signed out after Keep |
| 6 | Minor | a download running across a cache delete recreated the file | fixed: generation counter (RED) |

## As built (S8-04)

- **`src/components/ShareListSheet.tsx`** `{ listId, mode: 'share' | 'invite', onClose }` as planned: unconfigured /
  signed-out lines, 'This list is gone', friends with checkboxes (already in the list: 'In the list' / 'Invited', no
  checkbox), `SegmentedControl` of `ROLE_LABELS` (new in `src/constants/labels.ts`), the D34 sentence, the count line
  (share mode, from `selectListSpots`), the area line, `syncNow` → `shareList` / `invite`, Cancel works during the
  backup only, single-flight ref, D85 / 42501 / "Couldn't share" lines (a `false` result = the session ended: the same
  line), toasts 'Shared Downtown with @ana' / 'with 2 friends' / 'Invited @ana'.
- **List screen:** `ShareListSlot` is gone. The action row holds Send (own spots, D87) and the owner's 'Share list' /
  'Invite' (+ 'live: they'll see new spots too', `person.2.fill`, mapped to `group`), so an owner whose list holds only
  others' spots still shares. `MemberStrip` (owner + joined initials, max 5 + '+N', `person.2.fill`, `memberCount`,
  '+ Invite' owner only, press → `/list/<id>/members`). A member: no Rename, no bottom bar (Delete list, Edit area), no
  Share; long press 'Remove from list' on their own spots with role 'add' only; the owner on any spot. Deleting a shared
  list: 'Spots stay in your library. Members lose access to all 12 spots now.'
- **`app/list/[id]/members.tsx`** (Stack title 'Members') as planned, plus 'Invite' for the owner (opens the sheet in
  invite mode). Choosing a member's current role calls nothing. Errors: Alert with fixed copy ("Couldn't change the
  role. Try again." / "Couldn't remove @ben. Try again." / "Couldn't withdraw the invitation. Try again." / "Couldn't
  stop sharing. Try again." / "Couldn't leave the list. Try again."; 42501 → the not-allowed copy). Leave →
  `router.dismissAll()` + `router.navigate('/(tabs)/lists')` + toast 'Left Downtown'. Signed out: "Sign in to see
  who's in this list" + Sign in.
- `getHitLists` reads `owner_username` from the profiles mirror (never stored); `src/utils/members.ts`
  (`joinedMembers`, `memberCount` (D84), `initialOf`, `handleOf`). The rider's own name comes from the auth store (the
  mirror holds others' only, review #1).
- **Not built:** 'Add friend' on a member row (§3.5; `addFriend` takes a username, so it needs the row's username and
  a friends-store check) — left for S8-09 (review #2). A `needs_username` rider sees the sign-in line in the sheet,
  as in SendSheet; the tabs redirect to the username screen while `needs_username`, so it is not reachable (review #5).
- Tests 1808 → 1862 (`share-list-sheet` 19, `list-members` 18, `list-screen` +12, `members` 5, `db-hit-lists` +1);
  RED first (counts in the commit messages).

### S8-04 review (Opus, diff 61e84c8..HEAD)

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | Important | the rider's own member row / strip circle read 'A rider' / '?' (the profiles mirror never holds the rider) | fixed: auth username for the rider's own rows; fixtures no longer give it a mirrored name (RED: 3 cases) |
| 2 | Important (plan gap) | 'Add friend' on a non-friend member row missing | left for S8-09 (above) |
| 3 | Minor | rows already in the list read only '@ana' to VoiceOver | fixed: '@ana, In the list' (RED) |
| 4 | Minor | the double-tap test never reached the ref (second press hit a disabled button) | fixed: two presses before a re-render; fails with the ref removed (checked) |
| 5 | Minor | `needs_username` sees the sign-in line | left: same as SendSheet, unreachable behind the tabs' redirect |

## As built (S8-05)

- **`src/components/SharedBadge.tsx`**: `person.2.fill` + `memberCount` (D84); `sharedLabel(list)` 'Shared with 4' goes
  into the holder's VoiceOver label ('Downtown, Shared with 4'). Shown when `isShared(list)` (`src/utils/members.ts`:
  the flag, or a joined member, so another rider's list is badged before its flag arrives). On Lists tab rows, picker
  chips and detail 'In lists' chips (new `Chip` `accessory`, its label shrinks beside it), `AddToListSheet` rows. The
  read-only 'In lists' text of another rider's spot has no badge.
- **Lists tab:** 'My hit lists' = live lists that aren't another rider's (`isForeign` against `useRiderId()`), then
  'Shared with me' = `selectSharedWithMe` with '@ana · 12 spots' ('A friend · …' while the name isn't mirrored). An
  invitation (mirror row 'invited') shows in neither (S8-06 adds the Join row).
- **AddToListSheet:** `myRole(list, uid)` (members.ts, also used by the list screen and the hook): an area list →
  disabled with S2's hint; another rider's list unless joined with 'add' → disabled 'View only'. The first add to a
  shared list → `Alert('Everyone in Downtown (4) will see this spot.' / 'these 2 spots.' (only the spots not yet in
  it), undefined, Cancel / Add)`; Add → `addSpotsToList` → `setSyncState(confirmedListKey(id), '1')` (kept only after
  the add went through; an Add in flight counts as answered in this sheet); one question per list at a time
  (`asking` ref). Removing never asks. `forgetAccount` deletes every `confirmed_list:%` (D90: another account asks
  again; adopt's account switch, Remove and release all call it; sign-out Keep doesn't).
- **`useHitListActions.addSpotsToList`** refuses an area list and another rider's list unless joined with 'add'
  ('not your list'), before anything changes (review #7).
- **Shared area lists:** already held from S8-03/S8-04 (`selectListSpots`' owner rule, the member's list screen);
  S8-05 adds the cases (store: only ana's spots inside the circle with her filters; screen: 'Area · 2 mi of Capitol
  Hill', no Edit area).
- Tests 1862 → 1896 (RED first: 20 failed, then 6 for the review).

### S8-05 review (Opus, diff 6b0cf6a..246f55a): no Critical/Important

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | Minor | a long name pushed the badge out of a wrapping detail chip | fixed: label `flexShrink: 1` beside an accessory (RED) |
| 2 | Minor | 'Shared with me' shows signed out when 'Sign out anyway' left friends' lists on the phone | left: those lists are on the phone and read-only (S8-03 note); hiding them on one tab while the picker shows them would be odd. Plan's "signed out it isn't shown" holds whenever D86 removed them |
| 3 | Minor (S8-03) | at launch, before `phoneUserId`/session load, `useRiderId()` is null and others' lists count as mine for a moment | left for S8-09 (`useDbInit` sets `phoneUserId` after `setIsReady`) |
| 4 | Minor | question keyed on `shared` only | fixed: `isShared` (flag or a joined member) (RED) |
| 5 | Minor | 'these 3 spots' counted spots already in the list | fixed: counts arriving spots (RED) |
| 6 | Minor | a re-tick while the confirmed add was writing asked again | fixed: in-sheet `confirmedHere` (RED) |
| 7 | Minor | the hook didn't check the list side | fixed: `assertCanAdd` (RED: view, unjoined, area) |
| 8 | Minor | test gaps | added: double tap, retry after Cancel / failure, saved answer, no mirror row, LIKE escape; not added: an adopt-level D90 case (forgetAccount is covered and called on all three paths) |
| 9 | Product | 'Everyone in Downtown (1)' when nobody joined yet | left: D84 count; S8-09 / Michael may reword |

## As built (S8-06)

- **`src/sync/join.ts` `joinList(db, client, uid, listId)`** → `'joined' | 'withdrawn' | 'failed'`, never rejects:
  `respondInvite(…, 'join')`, then `syncNow` without waiting (its pull's fill brings the list and spots). Single-flight
  per rider and list across both tabs (a second caller gets the same promise); `isJoining` lets the Inbox's Decline wait
  for a running join. `NotAllowedError` (0 rows or 42501) → 'withdrawn' and the item leaves; an error or `false`
  (no session / not adopted) → 'failed', item kept.
- **Inbox** (`app/(tabs)/inbox.tsx`): 'Invitations' rows '@ana invited you to Downtown (12 spots)' with Join / Decline
  (confirm 'Decline the invitation to Downtown?', Cancel / Decline), long press Block (`confirmBlock`), spinner
  'Joining' / 'Answering' (never 'Sending', D34). Join's line 'Joined Downtown' (announced) with **Open** shown only
  while the list is held and live; 'This invitation was withdrawn.' (`INVITATION_WITHDRAWN` in lists.ts); failure →
  "Couldn't reach the server". The tab loads invitations on focus and pull-to-refresh with friends and sends; a Block
  from an invitation reloads invitations and friends (a load started before it loses its ticket).
- **Lists tab:** 'Shared with me' lists the signed-in rider's invitations first: 'Downtown', '@ana invited you · 12
  spots' (`inviteSpotCount`: '1 spot', 'no spots yet') and a **Join** chip (same `joinList`; toast 'Joined Downtown' or
  the withdrawn line). An invitation alone shows the section (no empty state). Signed out: none.
- `respondInvite`: once the server answered, a failing mirror write only warns (the next pull rewrites the mirror), so
  a Join isn't reported failed with nothing left to retry.
- Tests 1896 → 1924 (RED first: 15 failed, then 5 for the review).

### S8-06 review (Opus, diff 8371b39~1..182b570): no Critical

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | Important | Block from an invitation took no invites ticket: a load in flight put the row back; Friends stale until next sync | fixed: after an invite action, `loadAndApplyInvites` + `refreshFriends` (RED) |
| 2 | Minor | invite spinner read 'Sending your answer' (D34) | fixed: 'Answering' (RED) |
| 3 | Minor | Decline in the Inbox while a Join from the Lists tab waits | fixed: `isJoining` → Decline does nothing, the join wins (RED) |
| 4 | Minor | a local mirror failure after the server join read 'failed' and skipped the sync | fixed: `mirrorAnswer` warns only (RED) |
| 5 | Minor | `false` (adoption pending) and a Decline 42501 read "Couldn't reach the server" | left: same copy as friend requests and sends; adoption retries on 'active' |
| 6 | Minor | Lists tab invite subtitle '@ana invited you · 12 spots' vs the copy table's '@ana · 12 spots' (joined lists) | kept: an invitation must read as one; copy table row added below |
| 7 | Minor | test gaps | added: Decline failure/false, Block reload, Decline during Join, Open hidden for a deleted list, mirror failure; not added: account switch mid-join on the Lists tab (the toast names the list only; `joinList` and the Inbox key on the uid) |

## Unresolved questions

- D83–D91 are defaults (§9 Q44–Q52). Q11 (blocking inside a shared list) stays as D50: nothing changes in lists you
  share.
- Invite links to a shared list are S9 (`redeem_invite` exists); the members screen's 'Invite' opens friends only.
