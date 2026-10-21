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
- Failure (behaviour today, kept; M6-06 states and tests it): `Promise.all` rejects on the first failed group, the
  others keep running to completion (their writes land), `saving` resets, the screen stays; no Alert today. M6-04 adds
  an Alert "Some photos weren't imported" so it is not silent; it does not retry or roll back (known limit → §9).

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

## Unresolved questions

- D30 *default*: choosing 'Add photos there' / an existing spot drops the name and tags typed on the review. OK, or
  should a typed name fill an untitled existing spot? (§9 Q10)
