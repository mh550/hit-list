# Spot Finder - Refined Application Specification

## Simplified model (2026-10-20)

This section wins over everything below it. The full design, with the reasons, is
[`docs/specs/2026-10-16-simplification-design.md`](docs/specs/2026-10-16-simplification-design.md) (rev 2).
The sections of the model before it were removed on 2026-10-25 (git has them); what is left below is older
background and loses to this section wherever the two differ. Decisions: [`docs/decisions.md`](docs/decisions.md).

A spot is a place, photos, and three optional tags:

```ts
export interface Spot {
  id: string;
  name?: string;
  generated_name?: string;        // town
  location: GeoPoint;             // NO_LOCATION (0, 0) when unknown
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  feature_types: FeatureType[];   // [] = untagged; order = tap order
  stopped: boolean;               // skate stoppers on it; default false
  natural_speed?: NaturalSpeed;   // 0 None · 1 Little · 2 Some · 3 Enough · 4 Too much; undefined = not rated
  notes?: string;
  primary_photo_id?: string;
}
// FeatureType: rail, ledge, bank, hip, stair_set, gap, wall_ride, quarter_pipe
```

- **Filters (three):** What's here (any-of match on `feature_types`), Skate stopped (Any / Not stopped /
  Stopped), Natural speed (an inclusive range of 0–4; spots never rated are kept). The Filter button shows
  how many of the three are set.
- **Sort:** Distance, Date, Name (tap the active chip to reverse). Search by name or town, in both views.
- **Photos:** the detail screen shows a grid (main photo large, the rest in rows of three). Tapping a photo opens
  a full-screen viewer: swipe between photos, pinch to 4×, double-tap 2.5×, swipe down to close, long-press to
  set as main photo or remove it. Edit stages photo adds and removes until Save.
- **Nearby offer:** when a new spot would land within the import radius of a spot you already have, Quick Add and
  the import review offer to add the photos there instead; saving still creates a new spot by default.
- **Import radius:** stored in whole metres (`batch_import_radius`, 50 m by default), shown and typed in the
  user's units (50 m reads 164 ft).
- **Older details:** everything the previous model held (dimensions, material, stops, setup options, old scores)
  was archived in `legacy_json` by migration 3 and shows read-only under a collapsed 'Older details' on detail.

---

## Accounts and sharing (2026-10-22)

This section wins over the `[FUTURE]` sharing headings and the offline notes below. The full design, with the
reasons and every decision, is [`docs/specs/2026-10-22-accounts-and-sharing.md`](docs/specs/2026-10-22-accounts-and-sharing.md).
It is built and tested against the local Supabase stack only; nothing is deployed.

| Word in the UI | What it is | Live? |
|---|---|---|
| **Spot** | unchanged: one rideable thing at one place | no |
| **Hit list** | a named group of spots the rider made; a spot can be in any number of lists | no |
| **Area list** | a hit list defined by a circle on the map: the owner's spots inside it, including ones saved there later (computed, never stored) | the rule is |
| **Send** | a one-time copy of spots to friends in the app or as a link; later edits don't reach them | no |
| **Share** (a hit list) | live access: members see every spot now and later until they leave, are removed, or sharing stops | yes |
| **Friends** | riders connected by request and accept; the people you can Send to or invite directly | no |
| **Inbox** | friend requests, spots sent to you, invitations to shared lists | no |

**The two verbs (D34).** The words are never mixed: Send (paper plane) is only for copies, Share / Shared / Invite
(two people) only for live lists. Send screens say "They get a copy of these N spots as they are now. Changes you
make later won't reach them."; Share screens say "Everyone here sees every spot in <list>, including spots added
later, until you remove them or stop sharing."

**Ownership.** Every spot, photo and list has exactly one owner; only the owner edits or deletes it. Others who can
see a spot can Save a copy (their own private spot, 'From @name'). Others' photos live only in the phone's cache.

**Server model (Postgres, RLS on every table).** `profiles`, `spots`, `media`, `hit_lists`, `hit_list_spots`,
`hit_list_members`, `friendships`, `blocks`, `sends`, `links`; photos in one private Storage bucket. The one-line
RLS rule: a rider reads a spot only if they own it or belong to a shared list that holds it (a shared area list:
the owner's spots inside its circle), writes only their own rows, and sees profiles only of friends and co-members
(everyone else needs an exact-username lookup). Every policy and function has pgTAP cases.

**Sync (D48).** Accounts are optional. Changes queue in a local outbox and push when signed in and online; pull on
launch, on foreground, on pull-to-refresh and every 5 minutes while open; no realtime. Last write wins per row by
`updated_at`; a spot's photos merge as a set.

**Links (D44, D45).** A Send link opens a read-only preview in a browser with no login until it expires (1 day,
7 days, 30 days or never) or the sender revokes it. An invite link needs an account, works once, lasts 7 days and
can be revoked. A token lives in the URL fragment, only its SHA-256 is stored, and a dead link always reads the
same 'gone' answer.

---

> **Document Purpose**: This is a refined version of `spot_finder_app_spec.md`. Sections that deviate from or extend the original spec are marked with:
> - `[DEVIATION]` - Changed from original spec
> - `[ADDITION]` - New content not in original spec
> - `[CLARIFICATION]` - Ambiguity resolved through discussion

---


## Project Overview

A mobile-first application for action sports athletes (primarily street snowboarders/skateboarders) to track geographic "spots" — individual rideable features — and their associated gear requirements and metadata.

### `[ADDITION]` Core Design Principles

1. **Mobile-first, field-friendly** - Cold hands, limited time, potentially no cell service
2. **Quick capture, detail later** - Minimize friction when scouting
3. **Offline-capable** - Full functionality without connectivity
4. **Private by default** - User data is personal until explicitly shared

---

## Data Model

### Spots

`[DEVIATION]` A spot represents a single rideable feature at a geographic location.

> **Original spec** implied one feature per spot. **Previous revision** made spots a container with multiple features. **Current revision**: Flattened to one spot = one rideable thing. Multiple features at the same physical location are separate spots. This eliminates nesting ambiguity about which fields (in-run, landing, setup_options) apply per-feature vs. per-location.

#### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `name` | string | User-provided name (optional, see Unnamed Spots) |
| `generated_name` | string | `[ADDITION]` Reverse-geocoded fallback name |
| `location` | GeoPoint | Latitude & longitude |
| `created_at` | timestamp | When the spot was first created |
| `updated_at` | timestamp | Last modification time |
| `deleted_at` | timestamp? | `[ADDITION]` Soft delete timestamp (null if not deleted) |
| `status` | enum | `draft` or `complete` `[ADDITION]` |

#### `[ADDITION]` Spot Status

| Status | Description |
|--------|-------------|
| `draft` | Spot captured but details not yet filled in (default for new spots) |
| `complete` | User has finished adding details |

#### `[ADDITION]` Unnamed Spot Display

When a user skips naming a spot (e.g., Quick Add), the display name falls back:

1. User-provided `name` (if set)
2. `generated_name` — reverse-geocoded address/neighborhood (e.g., "NE 45th & University Way"), generated once at creation or when connectivity is available
3. "Untitled Spot" + creation date (e.g., "Untitled Spot — Feb 7")

---

### `[ADDITION]` Media

| Field | Type | Constraints |
|-------|------|-------------|
| `photos` | array | Max 20 per spot |
| `videos` | array | Max 2 per spot, compressed |
| `primary_photo_id` | UUID | Photo shown as thumbnail |

Each media item:
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `file_path` | string | Local/remote storage path |
| `captured_at` | timestamp | When photo/video was taken (EXIF). Kept on every photo; an imported spot's own `created_at` is the import time (D13) |
| `location` | GeoPoint | Where media was captured |
| `uploaded_by` | UUID | `[ADDITION]` The user who added it. Stored from day one (schema v2) so it can be shown later; unset until accounts exist |

---

### `[ADDITION]` User

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `email` | string | Login credential |
| `display_name` | string | Shown in shared contexts |
| `gear` | array | User's available gear for filtering |
| `created_at` | timestamp | Account creation |

#### `[ADDITION]` User Settings

| Setting | Type | Description |
|---------|------|-------------|
| `units` | enum | `imperial` or `metric` - toggle in Settings |
| `batch_import_radius` | number | Proximity radius for grouping photos (default: 50m) |

> `[ADDITION 2026-10-21]` The radius is stored in whole metres and shown and typed in the chosen unit (D23): Profile's
> 'Import radius · ft' field shows the 50 m default as 164 (Metric: 'Import radius · m', 50), and the import screen
> reads '(within 164 ft)'. Typed feet are rounded to the nearest metre on save.

---

## `[DEVIATION]` User Flows

### Quick Add Flow (Field Mode)

> **Original spec** didn't detail capture workflow. **Added**: Optimized for cold hands, limited time.

```
┌─────────────────────────────────────────────────────────┐
│                    QUICK ADD FLOW                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. User taps "+" button                                │
│           ↓                                             │
│  2. Camera opens immediately                            │
│           ↓                                             │
│  3. Take photos (location auto-captured)                │
│           ↓                                             │
│  4. Optional: Enter name (or leave blank)               │
│           ↓                                             │
│  5. Save as draft spot                                  │
│                                                         │
│  Total taps: 2-4                                        │
│  Total time: <30 seconds                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

> `[ADDITION 2026-10-21]` The review screen (step 4) keeps the three tags (what's here, skate stopped, natural speed)
> behind an 'Add details' link. When the location is within the import radius of spots you already have, it also
> shows up to three 'Near <name> · <distance>' rows, nearest first, each with 'Add photos there': the photos join that
> spot (its name and tags are kept, the typed ones dropped; D30) and the spot opens. Save still creates a new spot.

### Batch Import Flow

> **Added**: For users who take photos throughout the day with native camera.

```
┌─────────────────────────────────────────────────────────┐
│                   BATCH IMPORT FLOW                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. User selects "Import Photos" from menu              │
│           ↓                                             │
│  2. Select date range or specific photos                │
│           ↓                                             │
│  3. App reads EXIF geolocation data                     │
│     (photos without location grouped as "Unknown")      │
│           ↓                                             │
│  4. App groups photos by location proximity             │
│     (default 50m, configurable in Settings)             │
│           ↓                                             │
│  5. Each group becomes a draft spot, dated by the       │
│     import (D13); each photo keeps its capture date     │
│           ↓                                             │
│  6. User reviews/names each spot                        │
│     (unknown location photos can be placed manually     │
│      or assigned to an existing spot from this import)  │
│           ↓                                             │
│  7. User can add details later                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

> `[ADDITION 2026-10-21]` At step 6, a group whose first photo is within the import radius of a spot you already have
> shows 'Near <name> · <distance>' and a choice between 'New spot' (the default) and 'Add photos to <name>' (up to
> three nearby spots). Choosing one hides the group's name and sends its photos to that spot; the count and the
> button only count new spots. Groups of the same import never count as nearby. Photos that fail to save stay on the
> review for a retry (D31).

### Detail Entry Flow (Later)

```
┌─────────────────────────────────────────────────────────┐
│                   DETAIL ENTRY FLOW                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  From spot list, user opens draft spot:                 │
│                                                         │
│  1. Review/edit name and location                       │
│           ↓                                             │
│  2. Add feature details                                 │
│     - Type, shape, dimensions, material                 │
│     - Skate stop info                                   │
│     - Difficulty rating                                 │
│           ↓                                             │
│  3. Add in-run details                                  │
│     - Natural speed rating                              │
│     - Setup options (gear & build requirements)         │
│           ↓                                             │
│  4. Add landing details                                 │
│           ↓                                             │
│  5. Add overall ratings                                 │
│     - Intensity, bustability                            │
│           ↓                                             │
│  6. Mark as complete (or keep as draft)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### `[ADDITION]` Edit Flow

Editing uses the same UI as Detail Entry, pre-populated with existing data.

- Any spot (draft or complete) can be edited at any time
- Tapping a spot opens the detail view (read-only)
- Detail view has an "Edit" button → opens edit form (same as Detail Entry, pre-filled)
- All fields are editable including name, location (map pin drag), and all ratings
- Photos/videos can be added or removed
- Changes are saved explicitly (user taps "Save"), `updated_at` refreshed

### `[ADDITION]` Delete Flow

- "Delete Spot" option in spot edit view
- Confirmation dialog: "Delete [spot name]? This cannot be undone."
- Soft delete (`deleted_at` timestamp set, hidden from all views)
- Soft-deleted spots purged from server after 30 days
- No user-facing trash/recovery UI in v1

---

## User Interface

### Navigation

`[DEVIATION]` Consolidated Map/List into single view with toggle

> **Original spec** mentioned this as a possibility. **Revised**: Confirmed as preferred approach.

```
┌─────────────────────────────────────────────────────────┐
│  [Map 🗺️] [List 📋]              [Filter 🔽] [Search 🔍] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│            Main content area                            │
│         (Map or List based on toggle)                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│    [Spots]        [Profile]        [+ Add]              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Map View
- Pins for each spot
- Cluster nearby pins when zoomed out
- `[ADDITION]` Pin styling distinguishes draft spots from complete spots
- Tap pin → spot preview card
- Tap preview → full spot detail

### List View
- Spot cards showing:
  - Primary photo thumbnail
  - Spot name (or generated fallback)
  - Feature type and shape summary
  - `[ADDITION]` Difficulty rating badge (1-2 green, 3 yellow, 4-5 red)
  - `[ADDITION]` Distance from current location
- Sortable by: Name, Distance, Date Added, Intensity
- `[ADDITION]` Opens sorted by Distance, nearest first, once the location is known (D14); by Date,
  newest first, before that. A sort the user taps is kept for the session, whatever the location does.

### `[ADDITION]` Search

- Search by spot name or town, in both List and Map (D15; the two views share one search field, so
  they match the same spots). Never the generated "Untitled" label or the date.
- `[FUTURE]` Semantic search with RAG for queries like "steep rail with natural speed"

### Filters

Three filters (What's here, Skate stopped, Natural speed 0–4), as "Simplified model (2026-10-20)" at the top says.

---

## `[ADDITION]` Offline Support

### Sync Strategy

> **Built as (2026-10-22):** outbox plus pull by server `rev`, last write wins per row, no realtime, no user prompt
> for conflicts; see "Accounts and sharing (2026-10-22)" and decision D48 in the accounts spec. The diagram below is
> the original plan.

```
┌─────────────────────────────────────────────────────────┐
│                    OFFLINE BEHAVIOR                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  When OFFLINE:                                          │
│  ✓ View all previously synced spots                     │
│  ✓ Create new spots (queued for sync)                   │
│  ✓ Edit existing spots (queued for sync)                │
│  ✓ Take photos (stored locally)                         │
│  ✗ See other users' shared spots (future feature)       │
│                                                         │
│  When ONLINE:                                           │
│  → Sync queued changes                                  │
│  → Upload new media                                     │
│  → Download any remote changes                          │
│                                                         │
│  Conflict Resolution:                                   │
│  → Last-write-wins for simple fields                    │
│  → Merge arrays (photos)                                │
│  → Last-write-wins for setup_options as a unit          │
│  → User prompt for true conflicts                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Local Storage

- SQLite database for spot data
- Local filesystem for media (with lazy upload)
- Configurable cache size for map tiles

---

## `[ADDITION]` Technical Considerations

### Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Mobile Framework | React Native / Expo | Cross-platform, native APIs, offline support |
| Backend | Supabase | Auth, database, storage, realtime |
| Database | PostgreSQL + PostGIS | Geospatial queries |
| Map Provider | Mapbox | Offline tile support via native SDK |
| Media Storage | S3-compatible | Cloudflare R2 for cost efficiency |

### Performance Targets

- App launch to usable: < 2 seconds
- Quick add flow: < 30 seconds total
- Photo capture to saved: < 3 seconds
- Offline-first: All core features work without network

---

## Permissions & Visibility

Spots are **private by default** (visible only to creator).

### `[ADDITION]` Authentication

- **No account required for local use** — app is fully functional offline and locally without signing in
- **Account required for cloud sync and social features** — syncing across devices, sharing spots, crews
- Auth provider: Supabase Auth
  - Apple Sign In (required for iOS App Store if any social login offered)
  - Google Sign In
  - Email + password fallback
- Session tokens stored locally, long-lived (30 days)
- If token expires while offline, queue sync and re-auth when online

---

## Future Features (Preserved from Original)

### Spot Scanning

#### Option 1: Photo-based inference
- Multiple photos from different angles
- ML model infers in-run slope, feature dimensions, landing
- Pre-fills form fields for user confirmation

#### Option 2: LiDAR Scanning (iOS Pro devices)
- Full 3D scan of spot
- Stored model for visualization
- Precise measurements auto-extracted
- Share 3D models with crew

---

## Open Questions for Development

1. ~~**Units**: Support both imperial and metric? User preference or auto-detect by region?~~
   - `[RESOLVED]` User preference toggle in Settings. Support both imperial and metric.

2. **Map tile caching**: How much map area should be cached for offline use? (TBD — start with Mapbox default caching)

3. **Media compression**: What quality/size for compressed videos? (TBD — start with H.264, 720p, 30fps, max 60s)

4. ~~**Batch import proximity**: What radius (meters) groups photos into same spot?~~
   - `[RESOLVED]` Default 50 meters. Configurable by user.

5. ~~**Terrain park support**: Should parks have special UI for feature "runs" or ordering?~~
   - `[RESOLVED]` N/A. Data model is flat (one spot = one feature). Multiple features at one location are separate spots.

6. ~~**Native app vs PWA**~~
   - `[RESOLVED]` Native app (React Native / Expo). Offline-first + camera + maps requirements make PWA impractical.

7. ~~**Import date** (D13): is an imported spot dated by the photo's capture time or by the import?~~
   - `[RESOLVED 2026-10-15]` By the import. Each photo keeps its capture date (`captured_at`) and, once accounts exist, who uploaded it (`uploaded_by`).

8. ~~**Default sort** (D14): should the list open sorted by Distance whenever the location is known?~~
   - `[RESOLVED 2026-10-15]` Yes, for now. Date, newest first, until a fix arrives; a sort the user taps sticks.

9. **Town search** (D15): should search match a spot's town as well as its name? Michael: on the map yes; in the list unsure.
   - Current behaviour, recommended to keep: town matches in both views, because both share one search field and the query survives switching views. Different matching per view would make the same text show different spots. Open for Michael to confirm.

---

## Appendix: Terminology

### Setup Requirements Glossary

| Term | Category | Description |
|------|----------|-------------|
| Bungee | Gear | Elastic cord pulled by helpers to generate speed |
| Drop-in Platform | Gear | Elevated starting point for gravity speed |
| Scaffolding | Gear | Large structural drop-in build |
| Shovel Pull | Gear | Being towed by helper(s) with shovel handle (1 shovel per person) |
| Winch | Gear | Motorized cable system for towing |
| Speed Hump | Build | Snow mound for generating speed via pumping |
| Lip Build | Build | Snow shaping at takeoff |
| Landing Build | Build | Snow shaping for landing |

### Other Terms

| Term | Description |
|------|-------------|
| Natural Speed | Slope-generated speed from in-run to feature |
| Setup Option | One viable combination of gear and build requirements to hit a spot |
