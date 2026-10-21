# Spot Finder - Refined Application Specification

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

#### Feature Details

What the rideable feature is. All fields optional for draft spots.

##### Type
- Rail, Ledge, Bank, Hip, Stair Set, Gap, Wall Ride, Quarter Pipe, Other (custom)
- `[ADDITION]` Users can define custom types

##### Shape
- Flexible string field for describing shape
- Common patterns: DFD, FD, DF, Flat, Kinked, C-shaped, S-curved
- Examples: "Left-curved DFD", "Flat-down bar", "C-ledge"

##### Dimensions
| Field | Type | Description |
|-------|------|-------------|
| `length` | number (ft/m) | Length of the feature |
| `height` | number (ft/m) | `[ADDITION]` Height off ground (for rails) |
| `width` | number (ft/m) | `[ADDITION]` Width (for ledges) |

##### Material
- Aluminum, Concrete, Steel, Painted Steel, Wood, Plastic, Stone, Other

##### `[DEVIATION]` Skate Stop Information

> **Original spec** had this as a boolean with notes. **Revised**: Structured for better filtering and preparation.

| Field | Type | Description |
|-------|------|-------------|
| `is_stopped` | boolean | Whether feature has skate stops |
| `stop_type` | enum | `knobs`, `caps`, `brackets`, `welds`, `other` |
| `stop_description` | string | Details: "Knobbed at kinks", "2mm flat covers" |
| `removable` | boolean | Can stops be removed with tools? |

##### `[ADDITION]` Difficulty Rating

| Rating | Meaning |
|--------|---------|
| 1 | Very easy - smooth, park-quality |
| 2 | Easy - minor imperfections |
| 3 | Moderate - requires attention |
| 4 | Difficult - obstacles, rough surface |
| 5 | Very difficult - skate stops, hazards |

---

#### In-Run (Speed System)

##### `[CLARIFICATION]` Natural Speed Rating

> **Original spec** listed categories but was unsure of measurement. **Resolved**: Subjective 1-5 rating aligned with difficulty scale.

| Rating | Category | Description |
|--------|----------|-------------|
| 1 | No speed | Flat approach, requires full speed generation |
| 2 | Minimal speed | Slight slope, needs significant assistance |
| 3 | Some speed | Moderate slope, needs minor assistance |
| 4 | Natural speed | Sufficient slope for most tricks |
| 5 | Excess speed | Must control/scrub speed |

##### `[DEVIATION]` Setup Requirements

> **Original spec** mixed buildable elements (speed humps) with gear. **Revised**: Consolidated into a single `requires` array per setup option. Each item is categorized as gear (brought) or build (constructed at spot) for filtering and display.

**Gear** (things you bring — speed generation methods):

| Item | Description |
|------|-------------|
| `bungee` | Elastic cord pulled by helpers |
| `drop_in_platform` | Portable or modular platform |
| `scaffolding` | Large drop-in structure |
| `shovel_pull` | Towed by helper(s) with shovel handle (1 shovel per person) |
| `winch` | Motorized cable system for towing |

**Build** (things constructed at spot):

| Item | Description |
|------|-------------|
| `speed_humps` | Snow mounds for speed via pumping |
| `lip_build` | Snow shaping at takeoff |
| `landing_build` | Snow shaping for landing |

##### `[CLARIFICATION]` Setup Options

A spot may be hittable via **multiple different setups**. Each setup option lists everything required to hit the spot that way.

**Data Structure**:
```
spot.setup_options: [
  {
    requires: [
      { item: "winch", category: "gear" }
    ]
  },
  {
    requires: [
      { item: "drop_in_platform", category: "gear" },
      { item: "speed_humps", category: "build", quantity: 3 }
    ]
  },
  {
    requires: [
      { item: "shovel_pull", category: "gear", quantity: 2 },
      { item: "lip_build", category: "build" }
    ]
  }
]
```

- Each `requires` entry: `{ item, category, quantity? }`
- `item`: string from the gear/build enum
- `category`: `"gear"` or `"build"` — determined by item type, used for filtering and display
- `quantity`: optional integer (defaults to 1). For `shovel_pull`: number of shovels/people. For `speed_humps`: number needed.
- An empty `requires: []` means hittable with no equipment (natural speed only)

##### `[CLARIFICATION]` Two-Stage Filtering

Filtering uses the `category` field to apply two stages:

**Stage 1: Gear Filter ("Gear I Have")**
- User selects gear they own
- For each setup option, check only items where `category: "gear"`
- Spot matches if user's gear **contains all gear items** in **any one** setup option (superset match)
- A setup with no gear items matches all users

**Stage 2: Build Filter ("Exclude Build Requirements")**
- User can filter OUT spots requiring certain build work
- For each matching setup option, check items where `category: "build"`
- Spot passes if **at least one** matching option has no excluded build items

**Example Spot**:
```
spot.setup_options: [
  { requires: [{ item: "winch", category: "gear" }] },
  {
    requires: [
      { item: "drop_in_platform", category: "gear" },
      { item: "speed_humps", category: "build", quantity: 3 }
    ]
  }
]
```

| User Gear | Build Filter | Result | Reason |
|-----------|--------------|--------|--------|
| `["winch"]` | None | **Match** | Winch setup has no build items |
| `["drop_in_platform"]` | None | **Match** | Platform setup works (build shown as info) |
| `["drop_in_platform"]` | Exclude `speed_humps` | **No Match** | Only viable setup requires speed humps |
| `["winch", "drop_in_platform"]` | Exclude `speed_humps` | **Match** | Winch setup has no build requirement |
| `["bungee"]` | None | **No Match** | No setup uses bungee |

---

#### Landing

##### `[DEVIATION]` Landing Difficulty Rating

> **Original spec** described as "how high-impact" without scale. **Revised**: 1-5 scale consistent with other ratings.

| Rating | Description |
|--------|-------------|
| 1 | Very easy - natural slope, soft runout |
| 2 | Easy - slight flat, forgiving |
| 3 | Moderate - some flat, manageable |
| 4 | Difficult - significant flat or obstacles |
| 5 | Very difficult - hard flat, stairs, hazards |

##### `[ADDITION]` Landing Surface
- Snow (natural), Snow (built), Concrete, Asphalt, Grass, Dirt, Other

---

#### Spot Metadata

##### `[DEVIATION]` Unified Rating System

> **Original spec** had different scales/meanings for different ratings. **Revised**: All ratings follow consistent 1-5 scale where **higher = more difficult/intense/risky**.

| Field | 1 (Low) | 5 (High) |
|-------|---------|----------|
| Intensity | Mellow, relaxed spot | Consequence-heavy, committing |
| Bustability | No security presence | Immediate kickout guaranteed |
| Difficulty | Park-quality smooth | Skate stops, hazards |
| Landing Difficulty | Natural slope runout | Hard flat, obstacles |
| Natural Speed | No speed (flat) | Excess speed |

##### Bustability
- 1-5 star rating
- `[ADDITION]` Optional notes: "Security patrols hourly", "Neighbors will call cops"

##### Intensity
- 1-5 star rating
- Subjective overall assessment of spot consequence

##### Notes
- Free-form text field for additional information

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

| Filter | Type | Notes |
|--------|------|-------|
| Natural Speed | Range (1-5) | |
| Gear I Have | Multi-select | Superset match against setup options |
| Exclude Build | Multi-select (exclusion) | Filter OUT spots requiring selected build types |
| Type | Multi-select | Rail, Ledge, Bank, etc. |
| Bustability | Range (1-5) | |
| Intensity | Range (1-5) | |
| Status | Toggle | Show/hide draft spots |
| `[FUTURE]` Folder | Single-select | |

#### `[CLARIFICATION]` Gear + Build Filter Interaction

The gear and build filters work together as a two-stage pipeline over the unified `requires` array:

1. **Gear filter** checks items where `category: "gear"` — spot matches if user has all gear items in at least one setup option (superset match)
2. **Build filter** checks items where `category: "build"` — further narrows to setup options that don't require excluded build types

In the UI, gear and build items are displayed separately for clarity despite sharing a data structure.

---

## `[ADDITION]` Offline Support

### Sync Strategy

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

### `[FUTURE]` Sharing Model

```
Private (default)
    ↓
Shared with specific users
    ↓
Shared with Crew(s)
    ↓
Public (opt-in, future)
```

### `[FUTURE]` Crews

- Users create or join crews
- Spots can be shared with one or more crews
- Default visibility settings per crew
- Crew admin can manage membership

### `[FUTURE]` Folders/Collections

- Organize spots into folders
- Folders can have sharing permissions
- Example: "Seattle Downtown", "Best Powder Spots"

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
