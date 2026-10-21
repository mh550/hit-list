# HitList — simplification design (2026-10-16), rev 2

Written from Michael's 2026-10-16 feedback on the app as it stands after `overnight/2026-10-14`
(schema v2, suite green; merged into `main` the same day). **Rev 2** (later on 2026-10-16):
Michael dropped gear from the model entirely — see D22. This is the specification for the **next `/loop` run**. The loop plans
from it (superpowers:writing-plans) and does not re-open anything in §0 or §1; it brings anything
new to **§9 Needs Michael** and keeps going.

Numbers in brackets (**[F1]**, **[F2]** …) are Michael's five feedback items. **D17+** are the
decisions this document records, numbered after D16 in `OVERNIGHT.md`. Where a decision is marked
*my call*, Michael did not say it; it is the writer's default and he can overrule it in §9.

---

## 0. Why

Michael's words, condensed: *"The fields on a spot are way too verbose. We should make it simple
and usable first. The core functionality — add photos to a spot, mark one or more feature types
that are there, mark if the spot is stopped or not — should be easy, intuitive and simple.
Everything beyond the location is optional."*

The app today asks for 20+ fields across five sections (Feature, In-Run, Landing, Details,
Status) with three kinds of 1–5 star rating, nested "setup options", free-text shape and
material, and a draft/complete workflow. Most of those fields were designed before anyone used
the app on a phone. The motivation behind every change below is the same: **a spot is a place
with photos; everything else is a tag the rider may or may not add.** Where a field survives, it
survives because a rider in the field would actually tap it. Long term the model can be
re-hydrated per user ("add the features and fields you want"); none of that is built now.

### Goals
1. A spot can be saved with nothing but a location. Photos, name and every tag are optional.
2. Tagging a spot (what features are there, is it stopped, how much natural speed) takes a few
   taps on one short screen.
3. Photos at a spot can be browsed full-screen, swipe to the next, pinch to zoom **[F1]**.
4. The rest of the app (list, map, filters, sort, search, import, profile) stops referring to
   anything removed; there are no dead filters, badges or settings.
5. The import radius respects the chosen unit system **[F4]**.
6. Nothing a user already stored is lost silently (§4 migration).

### Non-goals (this run)
- Groups / folders / sports / sharing / ACLs **[F5]**: designed in §7 as direction only,
  explicitly **deferred** until the simplification has been on the phone for a while.
- Per-user customisable types or fields (the "hydrate the model later" idea). Noted in §7.
- Accounts, sync, video, offline tiles, moving a pin (unchanged from `README.md` "Not done yet").

### Anti-goals (would make this a failure even if it "works")
- A simpler form that still shows an empty "Feature / In-Run / Landing / Details" skeleton.
- Losing a user's typed notes, dimensions or skate-stop details without a trace.
- A natural-speed control that is *another* row of five stars with a different label.
- A photo viewer that is a third-party gallery library pulled in for one screen when the
  installed libraries already do it (see §3.1).

---

## 1. Decisions

| # | Decision | Built as | Source |
|---|----------|----------|--------|
| D17 | **Fields removed from a spot** | Custom type, shape, length/height/width, material, feature difficulty, skate-stop type / description / removable, setup options (nested), landing difficulty, landing surface, intensity, bustability, bustability notes, draft/complete status. | Michael 2026-10-16 **[F2]** |
| D18 | **Fields kept** | `name` (optional), `location`, photos (`media`), **feature types (multi-select)**, **skate-stopped (yes/no toggle, spot level)**, **natural speed (0–4 ordinal, see §2.3)**, **notes (free text, one field)**. | Michael 2026-10-16 **[F2]**; notes kept is *my call* (§9 Q1) |
| D19 | **Feature type becomes multi-select** | A spot carries `feature_types: FeatureType[]` (ordered as tapped). `Other` is removed with custom type. The list shows the first type with "+N" if more. | Michael: "mark one or multiple types of features that are there" |
| D20 | **No draft mode** | `status` is dropped from the model, the schema, the list badge, the map pin colour, the filter sheet and the Save button ("Save as Draft" → "Save"). Every saved spot is a spot. | Michael 2026-10-16 **[F2]** |
| D21 | **Natural speed is a labelled 5-step scale, not stars** | Five tappable segments with words, not stars: **None · Little · Some · Enough · Too much**, with a one-line description under the selected one. Stored as `natural_speed: 0–4` (0 = none). Unset is `undefined`. Details §2.3. | Michael: "make the measurement & units and the UX more clear than stars"; the words are *my call* (§9 Q2) |
| D22 | **Gear is removed entirely (rev 2)** | No gear on the spot, no build items, no setup options, no "Gear I have" filter, no "My Gear" on the Profile tab, no `gear` in `UserSettings`. The `GearItem` and `BuildItem` enums go. Old setup options are archived in `legacy_json` (§4) and nothing else. | Michael, rev 2: filtering on "what I have" is the wrong way round (he would rather hide spots he *lacks* gear for), and alternatives ("a bungee *or* a drop-in would work") make any gear list ambiguous; what gear really encodes is "needs extra speed", which natural speed already says. "KISS and remove it entirely, at least for now." |
| D23 | **Import radius in the user's unit** | Stored in **metres** as today; **displayed and typed in feet** when units are imperial (`Import radius · ft`), metres otherwise; converted on save, rounded to a whole unit on display. Default stays 50 m (shown as 164 ft). | Michael 2026-10-16 **[F4]** |
| D24 | **Photo gallery** | A full-screen pager (swipe between photos, pinch to zoom, double-tap to zoom, swipe down or ✕ to close, "3 / 7" counter) opened from any photo on the detail screen. The detail screen's photo area becomes a **grid** (hero + 3-across thumbnails) instead of hero + one horizontal strip. Details §3. | Michael 2026-10-16 **[F1]** |
| D25 | **Nearby-spot grouping on save** | When a new spot (Quick Add or import group) is saved within the import radius of an existing spot, the review screen offers **"Add photos to *<existing name>*"** beside "Save as new spot". Picking it adds the photos to the existing spot instead of creating one. No automatic merge, ever. Details §5. | Michael **[F3]**: posed as a question; building the offer is *my call* (§9 Q3) |
| D26 | **Old data is archived, not deleted** | Migration 3 copies each spot's removed fields into one `legacy_json` column on the row (and maps `feature.type` → `feature_types`, `skate_stops.is_stopped` → `stopped`, `metadata.notes` → `notes`). Nothing reads `legacy_json` except a one-line "Older details" disclosure on the detail screen when it is non-empty. Details §4. | *my call* (§9 Q4) |
| D27 | **Groups / sharing deferred** | §7 is direction, not scope. Nothing in §7 is built this run. | Michael: "consider deferring #5 until after the simplification has been done and tested" |
| D28 | **A failed upgrade blocks the app** *default* | If `migrateDb` throws at launch (e.g. migration 3), the app shows "Couldn't upgrade your spots — Nothing was lost… Close HitList and open it again to retry" instead of the tabs; the next launch retries. Media and settings still load, each on its own. | Builder (M1-05 review): this build's writes fail on an older schema, so a usable-looking empty app would let a Quick Add copy photos and then lose the spot, and saving Units would write default settings over the stored ones (§9 Q8) |
| D29 | **The viewer keeps its photo order while open** *default* | 'Set as primary' in the viewer does not move the photo to page 1 under the user: the viewer snapshots `spotPhotos()` order when it opens and only drops removed photos. The detail grid shows the new primary first as usual. Plan: `docs/plans/2026-10-20-m4-viewer.md`. | Builder (M4-01 plan): a page that jumps away right after a long-press action is disorienting (§9 Q9) |
| D30 | **Joining an existing spot drops the review's name and tags** *default* | 'Add photos there' (Quick Add) and 'Add photos to <name>' (import group) only add photos: the existing spot's name, tags and location are untouched, and the name / tags typed on the review screen are discarded (the import group's name field hides while an existing spot is chosen). If the spot had no photos, the first added one becomes primary. Plan: `docs/plans/2026-10-20-m6-review-screens.md`. | Builder (M6-01 plan): never overwrite a spot the user already described (§9 Q10) |

---

## 2. The spot, after

### 2.1 Data model (`src/types/index.ts`)

```ts
export interface Spot {
  id: string;
  name?: string;
  generated_name?: string;        // town, unchanged (D4)
  location: GeoPoint;             // NO_LOCATION when unknown, unchanged
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  feature_types: FeatureType[];   // [] = untagged
  stopped: boolean;               // skate stops present; default false
  natural_speed?: NaturalSpeed;   // 0 | 1 | 2 | 3 | 4, undefined = not rated
  notes?: string;
  primary_photo_id?: string;
}

export enum FeatureType {           // 'other' removed (D19)
  Rail = 'rail', Ledge = 'ledge', Bank = 'bank', Hip = 'hip',
  StairSet = 'stair_set', Gap = 'gap', WallRide = 'wall_ride', QuarterPipe = 'quarter_pipe',
}

export type NaturalSpeed = 0 | 1 | 2 | 3 | 4;
```

Removed types: `SpotStatus`, `Material`, `StopType`, `GearItem`, `BuildItem`, `LandingSurface`,
`Requirement`, `SetupOption`, `SkateStopInfo`, `Dimensions`, `FeatureDetails`, `InRun`, `Landing`,
`SpotMetadata`, `RequirementCategory`. `SortField.Intensity` is removed (§2.6).

`SpotUpdate` stays a patch type; `name`, `notes`, `natural_speed` and `primary_photo_id` accept
`null` to clear.

`UserSettings` becomes `{ units, batch_import_radius /* metres */ }`. The settings blob is
one JSON row merged over `DEFAULT_USER_SETTINGS` on read, so a stored `gear` key from an older
build is simply ignored; `saveUserSettings` writes the new shape and the key disappears on the
next save. No migration step is needed for settings.

### 2.2 Edit screen (`app/spot/[id]/edit.tsx`) — one screen, no section skeleton

Top to bottom. Every control is optional; the Save button is always enabled.

1. **Photos** — the same grid as the detail screen (§3.2) with ✕ on each thumbnail (staged
   removal + Undo, unchanged behaviour) and a trailing **"+"** tile that opens the photo library
   picker (`expo-image-picker`, multiple, `exif: true`) to add photos to this spot. *Adding photos
   from edit is new.* Picked photos are **staged like removals**: shown in the grid with a
   "new" corner mark, written only when the user taps Save (`useMediaActions().savePhotos`), and
   dropped if the sheet is dismissed — so adds and removes behave the same way. Each picked asset
   goes through `importPhotoFromAsset` (`src/utils/exif.ts`) so it keeps its own capture time
   and GPS, as import does; the spot's location is never changed by adding a photo. If the spot
   had no photos, the first added one becomes `primary_photo_id`. *My call.*
2. **Name** — single text field, placeholder *"Name (optional)"*. No section header above it.
3. **What's here** — chip row of the eight feature types, multi-select (D19). Selected chips
   are filled. No header word beyond the label.
4. **Skate stopped** — one `Switch`, label "Skate stopped". Nothing unfolds when on (D17).
5. **Natural speed** — the five-segment control of §2.3.
6. **Notes** — one multiline field, placeholder *"Anything else"*.
7. **Delete spot** — unchanged (confirm, soft delete).

Removed from this screen: Basic Info / Feature / In-Run / Landing / Details / Status headers,
Custom Type, Shape, Length/Height/Width, Material, Stop type/details/removable, Difficulty (both),
Setup Options and "Add Setup Option", Surface, Intensity, Bustability, Bust Notes, Draft/Complete.

The screen must fit comfortably in two phone heights with the keyboard closed; the loop checks
this by rendering in tests and eyeballing on the phone, not by a pixel assertion.

### 2.3 Natural speed control (D21)

Michael's objection to stars: a star rating reads as "how good", and five identical stars say
nothing about *what is being measured*. The replacement makes the quantity explicit in words.

Component `SpeedScale` (`src/components/SpeedScale.tsx`), replaces `StarRating` wherever
natural speed is shown. `StarRating` and `RatingBadge` are deleted once no caller remains.

| Value | Segment label | Description shown when selected |
|------:|---------------|---------------------------------|
| 0 | **None** | Flat. You make all the speed. |
| 1 | **Little** | Slight slope. Needs a lot of help. |
| 2 | **Some** | Some slope. Needs a bit of help. |
| 3 | **Enough** | Rolls in with speed for most tricks. |
| 4 | **Too much** | Steep. You have to scrub speed. |

- Edit: a segmented row of five equal segments (label inside each, 12–13 pt, `numberOfLines=1`;
  "Too much" may wrap to two lines on narrow phones, which is acceptable). Tapping a selected
  segment again clears the value (→ `undefined`). The description line sits under the row and
  reads *"Not rated"* when unset. `accessibilityRole="radiogroup"`; each segment a `radio` with
  `accessibilityLabel` = `"<label>: <description>"`.
- Detail and list: a compact read-only form — a five-cell bar with cells 0..value filled and the
  word to its right (e.g. `▮▮▮▯▯ Enough`). The bar is the same component with `readonly`.
- Filter sheet: the same control in **range** mode (tap a low and a high segment; §2.5).
- Colour: filled segments use `palette.blue[500]`, not yellow (yellow stars = rating). No
  red/green: speed is not good or bad.

Why 0–4 and not 1–5: the bottom of the scale is a genuine *none*, and a zero that means "none"
is clearer in the data than a 1 that means "none". The migration maps old 1–5 → 0–4 by
subtracting one (§4).

### 2.4 Detail screen (`app/spot/[id]/index.tsx`)

1. **Photo grid** (§3.2), or an empty "Add photos" tile when the spot has none (tap → edit).
2. **Title** (display name, D4 label when unnamed). No Draft badge (D20).
3. **Tag line**: feature-type chips (read-only), then **"Skate stopped"** as a red-outlined
   chip when `stopped` is true (absent when false — the absence is the "no").
4. **Natural speed** read-only bar + word, only when rated.
5. **Notes**, only when present.
6. **Older details** (D26): a collapsed disclosure, only when `legacy_json` is non-empty, that
   expands to a plain key/value list of whatever was archived (`Material: steel`, `Length: 12.0
   ft`, `Bustability: 3/5`, …). Read-only; editing and saving the spot leaves it untouched.

No `Section` boxes with headers. When a spot has only a location and photos, the screen is the
grid and the title — and that is a complete spot.

### 2.5 Filter sheet (`src/components/FilterSheet.tsx`) and `SpotFilters`

```ts
export interface SpotFilters {
  types: FeatureType[];           // any-of match against spot.feature_types
  stopped?: boolean;              // undefined = any; true = only stopped; false = only not stopped
  natural_speed_min?: NaturalSpeed;
  natural_speed_max?: NaturalSpeed;
}
```

Sheet, top to bottom: **What's here** (type chips) · **Skate stopped** (three-way segmented:
Any / Not stopped / Stopped) · **Natural speed** (range on `SpeedScale`; the current sheet has no
speed control at all though the store filters on it — this run adds it).
Removed: Gear I have, Exclude Build, Show Drafts, the unused bustability/intensity ranges.
Three filters is the whole sheet; `selectActiveFilterCount` counts exactly those three.

A spot with `natural_speed === undefined` is **kept** when a speed range is set (today's
behaviour for unset values; unchanged).

### 2.6 List, map, sort, search

- `SpotListItem`: thumbnail · name (2 lines) · first feature type + "+N" · a small
  `Stopped` chip when stopped · the speed bar when rated · distance. **No** Draft badge, **no**
  RatingBadge.
- Map pins: one colour (`SPOT_PIN`). The Draft pin colour and the `description="Draft"` go.
  Callout description = feature types joined with " · " (or nothing).
- Sort chips: **Distance · Date · Name**. Intensity is removed (`SortField.Intensity`).
- Search: unchanged (name or town, both views; D15 still open for Michael, see `OVERNIGHT.md`).

### 2.7 Quick Add and import review

- `app/add/review.tsx`: the button says **Save**. Below the name field, the same three tag
  controls as edit (§2.2 items 3–5) — *optional, collapsed under a "Add details" link by
  default* so the sub-30-second path is unchanged: photo → Save. (*My call*: tags are reachable
  from the review screen but not in the way.)
- `app/import/review.tsx`: each group card keeps its photo strip and optional name. It gains the
  §5 nearby-spot offer. No tag controls here (an import is many spots; tag them later).
- Both: no `status` is written; `feature_types: []`, `stopped: false`.

---

## 3. Photo gallery [F1] (D24)

### 3.1 How it is built

Use what is installed: `expo-image` for rendering, `react-native-gesture-handler` 2.32 +
`react-native-reanimated` 4.5 for pinch/pan/double-tap, and a horizontal paging `FlatList` for the
swipe between photos. Both libraries are in `package.json` but **nothing imports them yet**:
M4 wraps the app in `GestureHandlerRootView` in `app/_layout.tsx` and adds
`react-native-gesture-handler/jestSetup` and `react-native-reanimated/mock` to `jest.setup.ts`
(check `expo export` still bundles afterwards). **Do not add a gallery dependency.** If a pinch-zoom implementation on
reanimated turns out to need more than ~150 lines, the loop may fall back to
`react-native-zoom-toolkit` (pure JS over the same two libraries) via `npx expo install`, in its
own `chore:` commit, and must say so in the status log.

### 3.2 Detail-screen grid

- First photo (primary) full width, 4:3. Then **all** the rest in rows of three square tiles
  with `spacing.xs` gaps (the model caps a spot at 20 photos, so no "+N" collapse is needed).
  Tapping any tile opens the viewer at that index.
- Photos are in `spotPhotos()` order (primary first, then capture order), unchanged.

### 3.3 Viewer (`app/spot/[id]/photos.tsx`, modal route, `presentation: 'fullScreenModal'`)

- Black background, status bar hidden, the counter "3 / 7" top-centre, ✕ top-right.
- Horizontal paging between photos; pinch to zoom 1×–4×, pan while zoomed, double-tap toggles
  1× / 2.5×, paging is disabled while zoomed > 1.05×.
- Swipe down (vertical pan > 120 px at 1×) or ✕ closes. Back gesture also closes.
- Long-press → action sheet: **Set as primary** · **Remove photo** (confirm) · **Cancel**.
  Both call existing actions (`updateSpot({ primary_photo_id })`, `removePhotos`). *My call*:
  these two are the only edits in the viewer.
- Opened with `?index=N`. Route params: `id`, `index`.
- Accessibility: each page `accessibilityLabel="Photo N of M"`; ✕ is a `button` named "Close".

### 3.4 Tests

Render tests with the existing mocks (expo-image, gesture-handler's jest setup from the package,
reanimated's mock). Test: opens at the right index; counter text; ✕ calls `router.back`;
"Set as primary" updates the spot; "Remove photo" removes after confirm. Gesture maths (clamp,
zoom toggle, close threshold) lives in a pure `src/utils/gallery-gestures.ts` with unit tests, so
the gestures themselves do not need a device test.

---

## 4. Migration 3 (D26) — `src/db/schema.ts`

Append `migration3`. Never edit 1 or 2.

1. `ALTER TABLE spots ADD COLUMN feature_types_json TEXT NOT NULL DEFAULT '[]'`,
   `stopped INTEGER NOT NULL DEFAULT 0`, `natural_speed INTEGER`, `notes TEXT`, `legacy_json TEXT`.
2. Read every row (`SELECT id, feature_json, in_run_json, landing_json, metadata_json, status`),
   in JS (the migration function already receives the db), and for each:
   - `feature_types` = `[feature.type]` if `type` is set and not `'other'`, else `[]`.
     If `type === 'other'` and `custom_type` is set, `legacy.custom_type` keeps the text.
   - `stopped` = `feature.skate_stops?.is_stopped === true`.
   - `natural_speed` = `in_run.natural_speed - 1` when 1–5, else NULL.
   - Setup options (gear and build) are **not** mapped to anything; they go to `legacy` whole
     (rev 2, D22).
   - `notes` = `metadata.notes` or NULL.
   - `legacy` = every other non-empty value, flattened with readable keys and the unit applied
     at **read** time, not here (store metres): `custom_type, shape, length_m, height_m,
     width_m, material, stop_type, stop_description, removable, difficulty,
     setup_options (only when non-empty, as stored), landing_difficulty, landing_surface,
     intensity, bustability, bustability_notes`. **`status` is not archived** (every row has one,
     so archiving it would put an "Older details" row under every migrated spot — the exact
     skeleton this run removes), and empty strings / empty arrays / `is_stopped: false` do not
     count. `legacy_json` is NULL when nothing remains, which is the common case.
3. Rebuild the table without `status`, `feature_json`, `in_run_json`, `landing_json`,
   `metadata_json` (create `spots_new`, copy, drop, rename, recreate `idx_spots_deleted_at`;
   `idx_spots_status` goes). Foreign keys are off during migrations, so the media cascade is
   not triggered (this is the documented reason they are off; `CLAUDE.md`).
4. Row mappers in `src/db/spots.ts` read/write the new columns. `getSpots` must not read
   `legacy_json` into the store on every launch — a separate `getSpotLegacy(db, id)` is called
   by the detail screen when it mounts, and only then.

Tests (`db-migrate.test.ts`, real SQLite harness): a v2 fixture with a full-fat spot (every old
field set, two setup options, type `other` + custom type, draft) migrates to v3 with the exact
expected `feature_types`, `stopped`, `natural_speed`, `notes`, `legacy_json`; a v2 spot
with everything empty gets `legacy_json` NULL; a v1 DB migrates 1→2→3; migrating an already-v3
DB is a no-op; media rows survive (count unchanged, FK still satisfied after `foreign_keys = ON`).

---

## 5. Nearby-spot offer on save [F3] (D25)

Michael asked whether grouping should go beyond import. Answer built here: **offer, never
merge**. The import radius already encodes "this close is the same place" for photos; the same
number is the natural threshold for "this might be the spot you already have".

- Pure function `nearbySpots(location, spots, radiusMeters): Spot[]` in
  `src/utils/nearby-spots.ts` — known-location spots within the radius, nearest first, excluding
  soft-deleted. Unit-tested.
- **Quick Add review**: when the new location has ≥1 nearby spot, a card above Save reads
  *"Near <display name> · 23 ft"* with the existing spot's thumbnail and a button **"Add photos
  there"**. Tapping it saves the photos to that spot (`savePhotos` with its `spot_id`), does not
  create a spot, and dismisses to that spot's detail. With several nearby spots the card lists
  up to three, nearest first. **Save** still creates a new spot regardless.
- **Import review**: each group card with a nearby *existing* spot (not another group in the
  same import) gets the same offer; the group's photos go to that spot on save instead of
  creating one. Groups keep their own default of "new spot".
- Distance label uses `formatDistance` in the user's units.
- The offer uses `batch_import_radius`; there is **no second setting** (*my call*). The Profile
  hint for the radius becomes: *"Photos this close together import as one spot, and a new spot
  this close to one you have offers to join it."*

Not built: merging two existing spots; moving photos between spots after the fact (edit → long
press in the viewer could host "Move to…" later; §7).

---

## 6. Downstream sweep — everything that mentions a removed thing

The loop greps for each removed symbol and leaves zero references. Checklist:

| Removed | Where it is today |
|---------|-------------------|
| `SpotStatus`, `status`, "Draft" | types, schema v1 (stays, history), `spots.ts` mapper/insert/update, `spots-store` filter, `FilterSheet` Show Drafts, `SpotListItem` isDraft, `SpotMap` DRAFT_PIN, detail Draft badge, edit Status section, `add/review` + `import/review` `status: Draft`, README, CLAUDE.md, APP_SPECIFICATIONS |
| `StarRating`, `RatingBadge` | components/index, edit, detail, list item |
| `GearItem`, `UserSettings.gear`, Profile "My Gear" section + `GEAR_LABELS`, `toggleGear` (`use-settings-actions.ts`, `settings-store.ts`), FilterSheet "Gear I have" + `GEAR_LABELS`, gear cases in `profile.test.tsx` / `db-settings.test.ts` / `stores.test.ts` | types, profile, FilterSheet, settings store / actions / db defaults, tests |
| `Material`, `LandingSurface`, `StopType`, `STOP_TYPE_LABELS` (`constants/labels.ts`), `BuildItem`, `SetupOption`, `Requirement` | types, edit, detail, FilterSheet labels, spots-store two-stage filter, `units.ts` dimension helpers (`displayLength`, `inputToMeters`, `metersToDisplay`, `initialDimText`, `dimensionFromInput`: keep **only** what §4 legacy display and §D23 radius need; delete the rest) |
| `SortField.Intensity` | types, `SortChips`, `spots-store` sortKey, `selectActiveFilterCount` |
| `featureLabel(spot)` (`spot-name.ts`) | becomes `featureTypesLabel(spot)` → `"Rail"`, `"Rail +1"`, or `undefined` |
| Radius "meters" strings | `app/(tabs)/profile.tsx` hint + `accessibilityLabel="Import radius in meters"`, `app/import/index.tsx` "(within {batchRadius}m)" — both become unit-aware (D23) |
| Tests | `edit-dimensions.test.tsx`, `edit-skate-stops.test.tsx`, `spot-detail-stops.test.tsx`, `filter-sheet.test.tsx`, `spots-sort-search.test.tsx` (Intensity), `factories.ts`, `db-spots.test.ts`, `stores.test.ts`, `components.test.tsx` (RatingBadge/StarRating), `db-foreign-keys.test.ts`, `db-init.test.ts`, `spot-list.test.tsx`, `spot-map.test.tsx`, `spots-import-action.test.tsx`, `spots-view-mode.test.tsx`, `use-spot-actions.test.ts`, `screens.test.tsx` and `review-persist.test.tsx` ("Save as Draft") — about 18 files; rewrite or delete with the feature, never skip |

Docs: `APP_SPECIFICATIONS.md` gets a dated **"Simplified model (2026-10-16)"** section at the top
that states the new `Spot` and marks the old Feature/In-Run/Landing/Metadata sections and the
two-stage filter as **[SUPERSEDED]** (keep the text — it is the long-term hydration backlog).
`README.md` status and `CLAUDE.md` Layout/Conventions are updated in the same commit as the code
they describe.

---

## 7. Direction, not scope: groups, sports, sharing [F5] (D27)

Michael listed three ideas under "groups". They are three different things and should not share
one mechanism. Recorded here so the simplification does not paint them into a corner; **none is
built this run**, and the next spec starts from here after the simplified app has been used.

### 7.1 Sport (skate / snow / wake / …) is a *tag*, not a folder
A spot is often good for more than one sport, and a sport changes which feature types make
sense (a wakeboarder's "features" are not rails and ledges at all). Design: `sports: Sport[]` on the spot (multi-select chips like feature types), a
**sport filter** on the sheet, and later a per-user "sports I ride" setting that *hides* the
feature types that do not apply (this is the first instance of "hydrate the model per
user", and it is why custom type was removed now: the user-level list of visible types is the
right place for it). Not a folder, because one spot would need to be in two folders.

### 7.2 Collections (folders) are *user-made lists*, many-to-many
`collections (id, name, color, created_at)` + `collection_spots (collection_id, spot_id)`. A spot
can be in any number. The Spots tab gets a collection picker (chip row above the list/map, "All"
first); picking one filters both views — Michael's "view just that group on the map" is the same
filter applied to the map, free once filters drive the map too (today the map shows the filtered
set already). Smart collections ("by town", "by type") are a saved filter, not a stored list;
they can come later with the same picker.

### 7.3 Sharing is a *scope + recipients + duration*, separate from collections
What Michael described maps cleanly onto three parts:

- **Scope** — which spots: a collection, an explicit pick, or a **geographic circle**
  (centre + radius, the Marketplace-style drag), optionally **minus** some collections or spots.
  Store the scope as a rule (`{ circle, include_collections, exclude_collections, exclude_spots }`)
  so a long-running share can re-evaluate it as spots are added.
- **Recipients** — one person, several, or a crew (the existing `[FUTURE] Crews` idea).
- **Duration** — **snapshot** (export the current set once; a file / link; nothing live) or
  **live** (the rule keeps applying; both sides see new spots that fall inside it; an unseen
  marker — Michael's "blue dot" — is per-recipient read state `share_item_seen (share_id,
  spot_id, user_id, seen_at)`).

**ACL model to aim for** (needs accounts, which do not exist yet): every spot has one **owner**.
A share grants recipients **read** on the spots its rule currently selects; **comment/add
photos** is a per-share flag; **edit** is never granted through a share in v1 (fork-and-suggest
instead). Revoking a share removes read; a snapshot already sent is the recipient's copy and
cannot be revoked (say so in the UI). A live share is re-evaluated on the owner's device when
spots change and pushed as a diff, so excluding a spot later hides it going forward. Nothing
here requires a server-side ACL engine; it is a per-share allow-list recomputed from a rule.

**Order after this run** (proposal): 7.2 collections → 7.1 sport tag → snapshot share by
collection → geographic circle scope → accounts → live share. Each is its own spec.

### 7.4 Also noted, not built
- Per-user visible feature types (add / hide), replacing "custom type".
- Gear, if it ever returns: as a per-spot *outcome* ("needs extra speed", "needs a drop-in
  surface") rather than a list of equipment, since alternatives make equipment lists ambiguous
  (Michael, rev 2). Natural speed already covers the first of those.
- Per-spot *optional* detail packs (dimensions, material, stops detail, bust risk) a user turns
  on in settings — the hydrated model. The archived `legacy_json` is the seed data for it.
- "Move photo to another spot" from the viewer; merging two spots.
- D16 (untitled imported spots sharing one date) is still open in `OVERNIGHT.md`.

---

## 8. Order of work for the loop (one branch, `simplify/2026-10-16` from `spec/2026-10-16`, which is `main` + this document)

Each milestone: failing tests first, green, `npm run typecheck && npm run lint && npx jest --ci`,
small commits, status log line. Time boxes are guidance.

| # | Milestone | ≈ |
|---|-----------|---|
| M0 | Preflight: branch, `npm ci`, suite green, read this spec and `CLAUDE.md`. | 15 min |
| M1 | Types + migration 3 + mappers + factories (§2.1, §4). The ~18 old tests that reference removed fields (§6) are rewritten here. | 3 h |
| M2 | Edit screen rewrite + `SpeedScale` (§2.2, §2.3), add-photos-from-edit. | 2 h |
| M3 | Detail screen (§2.4) + grid (§3.2) + Older details disclosure. | 1 h |
| M4 | Full-screen viewer (§3.3, §3.4). | 2 h |
| M5 | Filter sheet, store filters, list item, map pin, sort chips (§2.5, §2.6). | 1 h 30 |
| M6 | Quick Add / import review: Save wording, optional tags, nearby-spot offer (§2.7, §5). | 1 h 30 |
| M7 | Import radius in the user's unit (D23). | 30 min |
| M8 | Sweep (§6): grep every removed symbol to zero; docs (`APP_SPECIFICATIONS.md` section, README, CLAUDE.md); `npx expo export --platform ios`; `npx expo-doctor`. | 1 h |
| Wrap | Status log, `HANDOFF` note, push, PR against `main` **not** merged (Michael reviews on the phone). | 20 min |

Stretch, in order, only if all above is green: (a) FilterSheet range mode polish; (b) a
"Move to…" entry in the viewer's long-press sheet.

---

## 9. Needs Michael (answer on the phone; the loop proceeds on the defaults in bold)

1. **Notes field (D18).** Michael's list did not mention notes either way. **Default: keep one
   free-text "Notes"** — it is the escape hatch for everything removed. Say "drop notes" to
   remove it.
2. **Natural-speed words (D21).** **Default: None · Little · Some · Enough · Too much**, 0–4,
   blue segments. Alternatives considered: a 0–100 % slider (false precision), "Push / Pump /
   Coast / Brake" (jargon that only works for skate). Send five better words if you have them.
3. **Nearby-spot offer (D25).** You asked *should* grouping go beyond import. **Default: build
   the offer** (never auto-merge), using the import radius as the threshold. Say "skip" to keep
   this run smaller; §5 then moves to §7.
4. **Archiving old fields (D26).** **Default: archive** into `legacy_json` and show a collapsed
   "Older details" row. Say "just delete" if you have no spot data worth keeping (the phone DB
   is the only copy).
5. **Tags on the Quick Add review screen (§2.7).** **Default: collapsed under "Add details"** so
   the fast path stays photo → Save. Say "always show" or "never show".
6. ~~Merge first?~~ **Done 2026-10-16:** `main` fast-forwarded to `overnight/2026-10-14`
   (D7). `spec/2026-10-16` = `main` + this document; the loop branches from it and opens its PR
   against `main`.
7. Still open from before: **D15** (town in list search) and **D16** (untitled import label date).
8. **Failed upgrade (D28, added by the M1-05 review).** **Default: block the app** with a "Couldn't
   upgrade your spots · Nothing was lost · close and reopen to retry" screen when a migration throws
   at launch. Say "let me in anyway" for the old behaviour (the list loads what it can and writes
   may fail).

9. **Viewer order after 'Set as primary' (D29, added by the M4-01 plan).** **Default: the viewer keeps
   its order while open** (the photo stays on the page you are looking at). Say "jump to first" to move it to
   page 1 at once.

10. **Joining an existing spot from a review screen (D30, added by the M6-01 plan).** **Default: only the photos
    go to the existing spot**; a name or tags typed on the review are dropped. Say "fill blanks" to have a typed name
    (and tags) fill an existing spot that has none.

---

## 10. What a builder may decide alone

Chip order within a row; exact spacing and font sizes within the theme; whether the viewer
uses `FlatList` or `Animated.ScrollView` for paging; the fallback zoom library if §3.1's
threshold is hit (say so in the log); test file names; which of `units.ts`'s helpers survive as
long as the radius field and legacy display work; the wording of the "Older details" keys.
