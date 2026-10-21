# M6 plan: Quick Add 'Add details' tags and the nearby-spot offer on both review screens

Spec: `docs/specs/2026-10-16-simplification-design.md` §2.7 (review screens), §5 (nearby-spot offer, D25), §9 Q3 + Q5
(defaults: build the offer; tags collapsed), new D30 (below). Features: M6-01 this plan + `nearbySpots` · M6-02 Quick
Add tags · M6-03 Quick Add nearby cards · M6-04 import offer · M6-05 walkthrough · M6-06 review. Each task: RED test
first, then code; `check.sh` green per commit.

Starting point (after M5): `app/add/review.tsx` = photo strip · name (`autoFocus`) · location box · **Save**
(`addSpot` with `feature_types: []`, `stopped: false`, then `savePhotos`, then `router.dismissAll()`; `saving` guard,
no `try/finally`). `app/import/review.tsx` = subtitle 'N spots from your photos…' · per group: photo strip, count ·
date, name, Remove · footer 'Import N Spots' (`Promise.all` over groups: `addSpot` + `savePhotos` each).

## M6-01 `nearbySpots` (done in this feature)

`src/utils/nearby-spots.ts`: `nearbySpots(location: GeoPoint, spots: Spot[], radiusMeters: number): Spot[]`. Unknown
`location` → `[]`; drops `deleted_at` and `!isKnownLocation` spots; keeps `distanceMeters ≤ radius` (inclusive);
nearest first; input not mutated. Returns spots only: callers recompute `distanceMeters` for the label (cheap, ≤ 3).

| Test (`src/__tests__/nearby-spots.test.ts`) | Mutation it kills |
|---|---|
| 10 m, 40 m, 60 m, radius 50 → [10 m, 40 m] (input order 40, 60, 10) | sort removed |
| spot at `NO_LOCATION`, radius 20 000 km → [] | — (excluded by `isKnownLocation`, not distance) |
| `deleted_at` set, 5 m → [] | deleted filter removed |
| query `NO_LOCATION`, spot 11 m from (0, 0) → [] | early return removed |
| spot at exactly the radius → included | `<=` → `<` |
| input array unchanged; helper `north(m)` checked against `distanceMeters` | — |

## Quick Add review layout (M6-02, M6-03)

Top to bottom in the existing ScrollView:

1. **Photos**: horizontal strip (unchanged); 'No photos captured' box when empty.
2. **Name**: field unchanged (`autoFocus`, placeholder, hint).
3. **'Add details'**: `Pressable`, `accessibilityRole="button"`, blue text link. Pressing it sets `showDetails` and the
   link disappears; in its place `<SpotTagFields value={tags} onChange={setTags} />` (eight chips · 'Skate stopped'
   switch · five-segment `SpeedScale`). `tags` state starts `{ feature_types: [], stopped: false }` (no
   `natural_speed` key). Not reversible (no 'Hide details'): one-way keeps it simple.
4. **Location box**: unchanged.
5. **Nearby card** (only when `nearby.length > 0`): one card, title row 'Already have this spot?', then up to three
   rows, nearest first (see below).
6. **Save**: text 'Save', label 'Save spot'. Always creates a new spot, cards or not; writes `tags` (all three fields
   from state, so untouched = `[]` / `false` / no speed).

Data: `spots = useSpotsStore(s => s.spots)`, `radius = useSettingsStore(s => s.batch_import_radius)`,
`units = useSettingsStore(s => s.units)` (subscribed, so a units change re-renders the labels),
`mediaBySpot = useMediaStore(s => s.mediaBySpot)`. `nearby = useMemo(() => nearbySpots(here, spots, radius).slice(0, 3),
[spots, latitude, longitude, radius])`.

### Nearby row contents

- Thumbnail 48 pt: `primaryPhoto(spot, mediaBySpot[spot.id])` → `resolvePhotoUri(file_path)`; grey placeholder box
  when the spot has no photo.
- Text 'Near <getSpotDisplayName(spot)> · <formatDistance(distanceMeters(here, spot.location) / 1000, imperial)>'
  (e.g. 'Near Downtown Rail · 16 ft'; '5 m' metric), `numberOfLines={2}`.
- Button 'Add photos there', `accessibilityRole="button"`, `accessibilityLabel="Add photos to <display name>"`.

### What 'Add photos there' does

`handleAddTo(spot)`, sharing the `saving` guard with Save (a double tap, or Save then 'Add photos there', runs once):

1. `savePhotos(photoUris.map(uri => ({ sourceUri: uri, id: newId(), spot_id: spot.id, location: hasLocation ? here :
   undefined, created_at: now })))`, **once**; `addSpot` is **not** called. The spot's location, name and tags are
   not touched (D30: what was typed or tagged on the review screen is dropped; it describes a new spot).
2. If the spot has no photo (`primaryPhoto(spot, mediaBySpot[spot.id]) === undefined`; M6-03: a spot with photos but no
   `primary_photo_id` already shows its first one, so it is left alone) and `saved.length > 0`:
   `updateSpot(spot.id, { primary_photo_id: saved[0].id })` (uses the resolved `Media[]`, so a skipped copy never becomes
   primary; a failed `updateSpot` is logged and rolled back by the hook and does not stop the navigation).
3. `router.dismissAll()` then `router.push(`/spot/${spot.id}`)`.
4. On a throw: `setSaving(false)`, `Alert.alert("Couldn't save the photos", …)`, stay on the screen. Save gets the same
   `try/catch` so both paths behave alike.

## Import review per-group offer (M6-04)

- Per group: `here = group.photos[0]?.location ?? NO_LOCATION` (the location the new spot would get);
  `offers = nearbySpots(here, existingSpots, radius).slice(0, 3)`. `existingSpots` = the store's spots only, so other
  groups of the same import never count.
- Group state gains `target: string | undefined` (`undefined` = 'New spot', the default; else an existing spot id).
- Card with offers: line 'Near <nearest display name> · <distance>', then a single-select chip row (`Chip`, as in the
  Filter sheet): 'New spot' (selected by default) · 'Add photos to <name>' per offer. Tap a chip → `target`. No offers →
  card unchanged, no chip row.
- `target` set: the name field is hidden (D30); Remove still works.
- Subtitle and button count only groups with `target === undefined`: '2 spots from your photos…', 'Import 2 Spots'.
  All groups targeting existing spots → subtitle 'Photos go to spots you already have.', button 'Add photos' (*my call*).
- `handleImportAll`: `Promise.all` as now; a `target` group calls `savePhotos` with `spot_id = target` (each photo keeps
  `captured_at` and its own `location`) and no `addSpot`; then the primary rule of Quick Add step 2. Two groups may
  target the same spot: compute up front which group (first in order) may set its primary, so the parallel writes
  never race on `primary_photo_id`.
- Failure (as built in M6-04, D31): `Promise.allSettled` over the groups. `savePhotos` logs a failed row and leaves it
  out (and `addSpot` logs a failed insert), so each group resolves with its unsaved photos rather than rejecting. Every
  group that has unsaved photos (or rejected) stays on screen with only those photos, aimed at the spot they were going
  to (`target` = the new spot's id when it was a new spot), and an Alert "Some photos weren't imported" shows; the
  screen closes only when all were saved. A chosen spot stays in the chip row even when it is not nearby (a new spot
  from a group with no location), so 'New spot' stays reachable. No rollback (§9 Q11).

## Profile hint (M6-03)

`app/(tabs)/profile.tsx` radius hint → 'Photos this close together import as one spot, and a new spot this close to
one you have offers to join it.' (`profile.test.tsx` updated). Units in the label stay for M7 (D23).

## Tests

| Feature | File | Cases |
|---|---|---|
| M6-01 | `nearby-spots.test.ts` | table above (7) |
| M6-02 | `quick-add-tags.test.tsx` (new) | first render: no chip/switch/segment, 'Add details' role button; press → 8 chips, 'Skate stopped', 5 segments, link gone; Rail + switch + Some → `addSpot` with `['rail']`, `true`, `2`; untouched → `[]`, `false`, no speed; name keeps `autoFocus`, Save text 'Save' |
| M6-03 | `quick-add-nearby.test.tsx` (new) | 5/20/45/80 m, radius 50 → three cards nearest first, display name + '16 ft' / '5 m', thumbnail when primary; none outside radius; none at `NO_LOCATION`; 'Add photos there' on 20 m → `savePhotos` ×1 with that `spot_id`, `addSpot` ×0, `dismissAll` then `push('/spot/<id>')`; spot without photos → `updateSpot(id, { primary_photo_id })`; Save with cards → `addSpot`; double tap → `savePhotos` ×1; units change re-renders label |
| M6-03 | `profile.test.tsx` | new hint text |
| M6-04 | `import-nearby.test.tsx` (new) | existing spot 15 m from group A, nothing near B → A shows offer, 'New spot' selected, B none; two groups 5 m apart, no store spot → no offer; choose existing for A → name hidden, subtitle/button count 1; Import → `addSpot` ×1 (B), `savePhotos` ×2 (A to existing id with `captured_at`, B to new); two groups → same spot without primary sets primary once; one group's `savePhotos` rejects → others still saved, Alert shown |

Mocks: `@/src/db` mocked as in `review-persist.test.tsx` (real hooks + stores, assert on the db calls), or the two
hooks mocked where call order matters; stores seeded with `setState`; `useRouter` overridden for `dismissAll` / `push` order (one shared `jest.fn` call log).

## Review (M6-06)

An Opus review of `git diff 8862e06..34e88ef -- . ':!.harness' ':!docs/plans/2026-10-20-m6-what-michael-will-see.md'`
(`8862e06` is "HARNESS: M5 verified"), written to `.harness/runs/hit_list-2026-10-20/reviews/m6.diff` (1429 lines).
**No Critical**, **2 Important** (both fixed). RED commits `b7af80d`, `6787c6f` before GREEN `075e635`, `86be528`.
Lines below are in the files as they are after the fixes.

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| 1 | Important | `app/add/review.tsx` Save and 'Add photos there' (were l.79-127) | `savePhotos` never rejects (it logs a failed row and resolves the rest) and `addSpot` swallowed insert errors, so the new `try/catch` and its Alert could never fire: a photo that failed was lost without a word (the app never writes to the camera roll). The test for it faked a rejection the real hook never makes. | `saveTo` (l.79) compares what was saved with what was on screen: unsaved photos stay, Alert "Some photos weren't saved". After Save created its spot, `createdId` (l.42, l.130) makes the retry add the rest there, so no second spot; the new spot is not offered as 'nearby' to itself. GREEN `075e635`; tests "a photo 'Add photos there' couldn't save stays on screen…", "a Save whose photos were not saved stays on screen, and a retry adds them to the same new spot". |
| 2 | Important | `src/hooks/use-spot-actions.ts` `addSpot` → `app/import/review.tsx` `createSpot` | A failed `insertSpot` was logged and the spot stayed in the store; every photo then failed its foreign key, and the group stayed aimed at a spot that does not exist, so each retry failed again (and the spot showed until the next launch). | `addSpot` takes the spot back out of the store and rejects (l.47). Import: the group rejects and stays a new spot (name kept); Quick Add: Alert "Couldn't save the spot" (l.125), no photo saved, a retry creates the spot. GREEN `075e635`; tests "addSpot takes the spot back out of the store and rejects…", "a group whose new spot wasn't written stays on screen as a new spot…", "a Save whose spot wasn't written alerts…". |
| 3 | Minor | `app/import/review.tsx` l.173 | A rejected new-spot group would create a duplicate on retry if it rejected after `addSpot`. | Resolved by 2: the only rejection left is `addSpot`'s, before any photo; `savePhotos` never rejects. |
| 4 | Minor | `app/import/review.tsx` chips, name, Remove | Editable while importing; `setGroups(failed)` is built from the groups at press time, so a mid-import edit was lost or a removed group came back. | `disabled={saving}` on the chips (l.240, l.249) and Remove (l.272), `editable={!saving}` on the name (l.263). GREEN `075e635`; test "locks the choices, names and Remove while importing". |
| 5 | Minor | both review screens' guards | State-only guard: two presses before a re-render both read `saving === false` (the old double-tap test passed only because RNTL re-renders between presses). Import ran every group twice (4 calls for 2). | `savingRef` checked and set synchronously (`add/review.tsx` l.63, `import/review.tsx` l.144). GREEN `075e635`; tests "runs once when two presses land before a re-render" (Quick Add) and "imports once when two presses land before a re-render". |
| 6 | Minor, not fixed | `primary_photo_id` set before the photos are saved | If photo 0 fails, the spot names a primary with no row. | Left: `primaryPhoto` falls back to the first saved photo, and import's retry sets the primary when the spot has no row. Recorded in D31 as a known limit. |
| 7 | Minor | accessibility | 'Add photos there' was labelled 'Add photos to <name>' (Voice Control "tap Add photos there" would not match); Remove had no role; the Import spinner had no label. Import's choice chips are ~35 pt tall. | Label 'Add photos there, <name>' (l.242); Remove `accessibilityRole="button"` (l.275); spinner label 'Importing' (l.293). GREEN `075e635`. Chip height left as is: `Chip` is shared with the Filter sheet and edit screen (a later polish pass). |
| 8 | Minor | `app/add/review.tsx` nearby card | Shown with 'No photos captured'; 'Add photos there' then opened the spot with nothing added. | No card without photos (l.54). GREEN `075e635`; test "offers no spot when there are no photos to add". |
| 9 | Minor | `app/import/review.tsx` 'Near' line | Always named the nearest spot, even after choosing another. | Names the chosen nearby spot, else the nearest (l.81). RED `6787c6f`, GREEN `86be528`; test "names the chosen spot and its distance in the line above the choice". |
| 10 | Minor, not fixed | `app/import/review.tsx` `offers` | Recomputed on every name keystroke. | Left: ≤ 3 offers per group over the store's spots, cheap at this scale. |

Mutation checks (each fails exactly one test): ref → state guard on either screen; no `setCreatedId`; unsaved photos
not kept on screen; offer card shown without photos; chips not disabled while saving; `addSpot` without the store
rollback.

### Answers to the M6-06 questions

1. **'Add photos there' cannot run twice under a double tap: yes, now in every case.** Save and 'Add photos there'
   share `start()` (`add/review.tsx` l.62-67), which checks and sets `savingRef` synchronously before `setSaving`, so a
   second press in the same frame returns; `disabled={saving}` greys both buttons afterwards. Tests "runs once under a
   double tap" (presses with re-renders between) and "runs once when two presses land before a re-render" (three
   presses in one `act`: `savePhotos` ×1, `addSpot` ×0). Import uses the same ref (l.144).
2. **Distance uses the current units and re-renders on a change: yes, on both screens.** Each subscribes with
   `useSettingsStore((s) => s.units === UnitSystem.Imperial)` and passes it to `nearbyLabel` → `formatDistance`. Tests
   "uses metric distances when units are metric, and follows a units change" in `quick-add-nearby.test.tsx` and
   `import-nearby.test.tsx` (render metric, `setState` imperial in `act`, label changes), plus `nearby-spots.test.ts`.
3. **Import with a group going to an existing spot: every group runs, and no failure is silent.** `Promise.allSettled`
   over all groups (new and existing in parallel; who sets a primary is decided up front). A group's unsaved photos (or
   a group whose new spot the DB refused) stay on screen aimed at the right spot with the Alert "Some photos weren't
   imported"; the groups that saved are not redone. Tests: "a failed group alerts, keeps only the failed groups on
   screen…", "a photo the existing spot didn't get stays on screen…", "a new spot's unsaved photos stay aimed at that
   spot…", "a group whose new spot wasn't written stays on screen as a new spot…". Recorded as D31 / §9 Q11 (extended
   for Quick Add and the refused spot).

### Simplification pass (`refactor:` commit `8fb2d16`)

- Import review drops its eight `useCallback` wrappers (the React Compiler memoizes); Quick Add lost its own in the
  GREEN rewrite, which is what removed the stale `saving` dependency.
- `imperial` is selected as a boolean on both screens (`075e635`); the retry comment covers a refused spot.
- Not done: one shared "save these photos to a spot, report the unsaved ones" helper for both screens (the two differ
  in where each photo's location and capture time come from; a hook change would touch edit too).

## Unresolved questions

- D30 *default*: choosing 'Add photos there' / an existing spot drops the name and tags typed on the review. OK, or
  should a typed name fill an untitled existing spot? (§9 Q10)
