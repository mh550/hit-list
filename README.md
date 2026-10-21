# HitList

A mobile-first app for street snowboarders and skateboarders to keep track of spots: one rideable
feature at one place (a rail, a ledge, a bank…), with photos, a map and three quick tags: what's
here, whether it's skate-stopped, and how much natural speed the in-run gives.
Built with Expo (React Native) and runs on an iPhone through Expo Go.

## Status (2026-10-21)

Works end to end in tests and bundles for iOS. The simplification (rev 2,
`docs/specs/2026-10-16-simplification-design.md`) is being built: the model step (M1), the
one-screen edit (M2), the detail screen (M3) the full-screen photo viewer (M4) and the
three-filter list (M5) and the review screens (M6) are done.

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
- Unnamed spots read `Untitled · Seattle · Oct 13, 2:22 PM` (town from Apple's geocoder, which needs internet).
- Offline-first SQLite storage with versioned migrations.

## Run it

```bash
npm ci
npm run start:tailscale     # then scan the QR code with the iPhone (Expo Go, SDK 57)
```

Full phone instructions: [`docs/RUNNING-ON-PHONE.md`](docs/RUNNING-ON-PHONE.md).

```bash
npm run typecheck && npm run lint && npx jest --ci
npx expo export --platform ios --output-dir /tmp/hl-export
```

## Not done yet

- Moving a spot's pin in the edit screen.
- Spots saved without GPS can't be placed on the map yet (they stay in the list).
- Cloud sync, accounts, sharing, crews, folders; video; offline map tiles (needs a dev build).
- A build that runs without the desktop (an EAS preview or production build through TestFlight, or
  EAS Update; a dev build still loads from Metro); today the app needs Metro running on the desktop.

Product spec: [`APP_SPECIFICATIONS.md`](APP_SPECIFICATIONS.md).
