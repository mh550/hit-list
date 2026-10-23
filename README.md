# HitList

A mobile-first app for street snowboarders and skateboarders to keep track of spots: one rideable
feature at one place (a rail, a ledge, a bank…), with photos, a map and three quick tags: what's
here, whether it's skate-stopped, and how much natural speed the in-run gives.
Built with Expo (React Native) and runs on an iPhone through Expo Go.

## Status (2026-10-20, simplified model)

Works end to end in tests and bundles for iOS. The simplification (rev 2,
`docs/specs/2026-10-16-simplification-design.md`) is being built: the model step (M1), the
one-screen edit (M2), the detail screen (M3), the full-screen photo viewer (M4), the
three-filter list (M5), the review screens (M6) and the import radius in your units (M7) are done.

- Spot model (database v3): feature types (several per spot), skate stopped, natural speed (None to Too
  much, 0–4), notes. Migration 3 archives every older field (dimensions, material, stops, setup options,
  old scores…) in `legacy_json`, read only by `getSpotLegacy`.
- Edit is one short screen: a photo grid (remove with ✕, add from the library with '+', written on Save), name,
  tagging (feature types as chips, a Skate stopped switch, natural speed on a five-word scale), notes, Delete.
- Quick Add (camera → optional name → Save) and batch import from the photo library (grouped by
  place from GPS; the EXIF capture time sets each spot's date). On Quick Add the three tags sit behind an 'Add
  details' link, so the fast path stays photo → Save.
- Nearby-spot offer: when a new spot would land within the import radius (Profile, 50 m by default) of a spot you
  already have, Quick Add shows up to three 'Near Library Rail · 16 ft' rows with 'Add photos there', and the import
  review lets each such group choose between 'New spot' (the default) and 'Add photos to Library Rail'. Joining adds
  only the photos; the existing spot's name and tags stay as they were.
- Detail shows the photo grid (or an 'Add photos' tile), the title, the tags (a red 'Skate stopped'), the natural
  speed bar and notes. Data from before the simplification (dimensions, material, old scores, setup options…) sits
  under a collapsed 'Older details', in the units picked on Profile; spots without it show nothing extra.
- Full-screen photo viewer: tap a photo on the detail screen to open it there, black, with an 'N / M' counter and a ✕.
  Swipe between photos, pinch up to 4×, double-tap for 2.5×, swipe down at 1× to close; long-press a photo to set it
  as the main photo or remove it from the spot (with a confirm).
- Photos are kept in the app's own storage and shown as list thumbnails, the detail grid and the viewer.
- Spots list with three filters (feature type, skate stopped, natural speed range) and distance from where you are.
  Each row shows what's there ('Rail +2'), a small red 'Stopped' tag and the natural speed bar once rated.
- Apple Maps view (List | Map), one pin colour; a pin's bubble lists the spot's feature types ('Rail · Ledge'), tap through to the spot. Nearby spots
  cluster into a numbered circle; spots at the same place open a list to pick from.
- Search by name (both views) and sort by Distance, Date or Name (list).
- Hit lists (S1): a Lists tab ('My hit lists', each with its live spot count) where '+ New hit list' names a list;
  a list opens as the same List | Map view scoped to its spots, with Rename, long-press 'Remove from list' and
  'Delete list' (spots stay in your library). Add a spot from its page ('In lists' chips, '+ Add to hit list') or
  select several on the Spots tab (long press or 'Select', then 'Add to list'); a chip row above the Spots tab
  ('My spots', then each list) scopes both views. A spot can be in many lists. Local only, no accounts yet.
- Area lists (S2): Lists → '+ Area list' opens 'Pick an area' (a map with a fixed centre pin and a circle, radius
  chips in your units (0.25–25 mi / 0.5–50 km), place search, 'Use my location', the filters and a live count).
  'Save as hit list' → 'Just these N spots' (a normal list of the spots inside now) or 'Keep it updated' (an area
  list: every spot of yours inside the circle that passes its filters, now and later, computed, never stored).
  Its row reads 'Area · 2 mi'; its screen has 'Edit area'. Spots with no location are never in an area.
- Unnamed spots read `Untitled · Seattle · Oct 13, 2:22 PM` (town from Apple's geocoder, which needs internet).
- Profile: Imperial or Metric units; the import radius is shown and typed in them (50 m reads 164 ft), and the
  import screen says '(within 164 ft)'.
- Offline-first SQLite storage with versioned migrations.
- Accounts (S4), optional: Profile → Sign in → your email → a 6-digit code (no password) → pick an @username
  (and an optional display name). Profile then shows `@you`, Sign out and Delete account (removes the account, its
  photos and sends from the server; spots on the phone stay). A build without the two `EXPO_PUBLIC_SUPABASE_*` values
  says 'Accounts aren't set up in this build' and works as before. The backend is the local Supabase stack only
  (`supabase/README.md`).
- Backup and sync (S5): signing in adopts every spot, photo and hit list already on the phone into the account and
  uploads them (photos as JPEGs, long edge ≤ 2048 px; the originals on the phone stay). Changes back up on launch, when
  the app comes to the foreground, every 5 minutes and on pull-to-refresh on the Spots tab; a second phone of the same
  rider gets them, and the newer edit wins. Profile shows 'Backed up · 3 min ago', or 'N changes not backed up' with
  Retry. Sign out backs up first, then asks Keep / Remove from this phone (Remove only when nothing is pending); a
  different account signing in never sees the previous account's spots.
- Friends and Inbox (S6): Profile → Friends adds a rider by their exact @username (no search by name; 'BEN' finds
  @ben), lists your friends, the requests you sent (Cancel) and the riders you blocked (Unblock); long-press a friend
  for Remove friend or Block (they aren't told: to them you read like a name that doesn't exist). A fourth tab, Inbox
  (Spots · Lists · Inbox · Profile), shows friend requests with Accept / Decline and a badge with the number you
  haven't seen; opening it clears the badge. Friends' names are kept on the phone so they show offline.
- Send spots to friends (S7): a one-time copy, never a live link. Send from a spot's page (the paper-plane; not on
  another rider's spot), from Select on the Spots tab ('Send (3)'), from a hit list ('Send these spots') or from the
  area picker; tick friends, the sheet says "They get a copy of this spot as it is now. Changes you make later won't
  reach them." The friend's Inbox shows '@ana sent you 3 spots' with a thumbnail: Save all, Save into a new hit list,
  Pick spots or Dismiss (the sender isn't told). Saved copies are the friend's own spots ('From @ana' on detail) with
  their photos, backed up like any other. Profile → Sent lists what you sent: Waiting (Withdraw), Saved, Withdrawn.
- Shared hit lists (S8): live access, not a copy. From a hit list, 'Share list' → tick friends → 'Can add spots' or
  'View only'. They get an invitation in the Inbox ('@ana invited you to Downtown (12 spots)', Join / Decline); once
  joined, the list shows under 'Shared with me' on the Lists tab and every change on either side arrives on the next
  sync. Others' spots are read-only on your phone (no Edit, no Send; 'Save a copy' makes one your own); their photos
  download when first shown and live in the phone's cache. A list shared by you or with you carries a two-people badge
  with the member count. Members (the strip on the list) lets the owner change roles, remove a member or stop sharing,
  and a member leave; the first spot you add to a shared list asks 'Everyone in Downtown (4) will see this spot.' once.
  When you leave or are removed, the list, its spots and their cached photos leave your phone on the next sync.

## Run it

```bash
npm ci
npm run start:tailscale     # then scan the QR code with the iPhone (Expo Go, SDK 57)
```

Full phone instructions: [`docs/RUNNING-ON-PHONE.md`](docs/RUNNING-ON-PHONE.md).

```bash
npm run typecheck && npm run lint && npx jest --ci
npm run db:start && npm run db:reset && npm run test:integration && npm run db:stop   # needs Docker
npx expo export --platform ios --output-dir /tmp/hl-export
```

## Not done yet

- Moving a spot's pin in the edit screen.
- Spots saved without GPS can't be placed on the map yet (they stay in the list).
- Invite links, crews, folders; a cloud Supabase project; video; offline map tiles (needs a dev build).
- A build that runs without the desktop (an EAS preview or production build through TestFlight, or
  EAS Update; a dev build still loads from Metro); today the app needs Metro running on the desktop.

Product spec: [`APP_SPECIFICATIONS.md`](APP_SPECIFICATIONS.md).
