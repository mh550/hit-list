# HitList

A mobile-first app for street snowboarders and skateboarders to keep track of spots: one rideable
feature at one place (a rail, a ledge, a bank…), with photos, a map, gear/build filters and ratings.
Built with Expo (React Native) and runs on an iPhone through Expo Go.

## Status (2026-10-15)

Works end to end in tests and bundles for iOS; first run on the phone is the next step.

- Quick Add (camera → optional name → draft) and batch import from the photo library (grouped by
  place, real EXIF capture time and GPS).
- Photos are kept in the app's own storage and shown as list thumbnails and a detail gallery.
- Spots list with filters (feature type, gear/build, drafts) and distance from where you are.
- Apple Maps view (List | Map), drafts in a different pin colour, tap through to the spot.
- Unnamed spots read `Untitled · Seattle · Oct 13, 2:22 PM` (town from the on-device geocoder).
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

- Pin clustering when several spots share one place (they overlap as pins for now).
- Sort control and search on the Spots list.
- Editing skate-stop details, removing a photo, moving a spot's pin in the edit screen.
- Spots saved without GPS can't be placed on the map yet (they stay in the list).
- Cloud sync, accounts, sharing, crews, folders; video; offline map tiles (needs a dev build).
- A standalone build (EAS dev build + TestFlight); today the app needs Metro running on the desktop.

Product spec: [`APP_SPECIFICATIONS.md`](APP_SPECIFICATIONS.md).
