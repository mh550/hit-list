# Running HitList on the iPhone (Expo Go over Tailscale)

HitList runs in **Expo Go** on the iPhone, served by Metro on the Pop!_OS desktop over the tailnet.
No App Store build, no Mac, no Apple login is needed for this. (A dev build + TestFlight is the next
step; see "Later" at the bottom.)

## What you need

- **Expo Go** from the App Store, **SDK 57** (the version Expo Go ships today; the project is on
  SDK 57). If the App Store version moves to SDK 58, see "If Expo Go says the SDK is incompatible".
- **Tailscale** on both the desktop (`pop-os`, `100.88.90.97`) and the phone (`iphone-15`), both
  connected. Check with `tailscale status` on the desktop: `iphone-15` must not say "offline".

## Start it

On the desktop:

```bash
cd ~/projects/hit_list
git switch overnight/2026-10-14     # until it is merged into main
npm ci                              # first time on this branch: SDK 57 packages
npm run start:tailscale
```

Metro prints a QR code and the address `exp://100.88.90.97:8081`. On the phone, open the iPhone
Camera, point it at the QR code and tap the banner; it opens in Expo Go. (Or in Expo Go: "Enter
URL manually" → `exp://100.88.90.97:8081`.) The first load bundles about 9 MB of JavaScript and
takes a little while; later loads are quick.

## What to expect

- **Spots tab, List** (default): every spot with a thumbnail (its main photo, or "No Photo"), a Draft
  badge for drafts, and a distance once you allow location. Unnamed spots read
  `Untitled · Seattle · Oct 13, 2:22 PM` (the town arrives a moment after saving, from Apple's
  geocoder: it needs internet, and the spot's coordinates are sent to Apple to look it up) or `Untitled · Oct 13, 2:22 PM` without a town.
- **Spots tab, Map**: the List | Map switch under the header. Apple Maps, one pin per spot: blue for
  complete spots, yellow for drafts. Tap a pin, then its bubble, to open the spot. Spots saved
  without GPS appear in the list but not on the map.
- **+ button**: camera → take photos → name it or leave it blank → Save as Draft. The photos are
  copied into the app's own storage, so they stay after iOS clears its caches.
- **Import Photos** (Profile tab): pick photos from the library; they are grouped by place (50 m by
  default) using their real capture time and GPS.
- **Spot detail**: the main photo large, the rest in a row underneath.
- iOS asks for **location** when the Spots tab first opens, and for the **camera** on the first
  photo. Saying no is fine: distances stay blank and the map just shows the spots.

## First things to check (they cannot be tested headlessly)

1. **Tap Map.** You should see Apple Maps with pins. A red screen saying "view config not found"
   would mean Expo Go lacks react-native-maps (not expected for SDK 57).
2. **Take a photo with the + button**, save, then force-quit Expo Go and reopen the project. The
   photo should still show. While you do this, watch the Metro terminal on the desktop: a line
   `[persistPhoto] copy failed` means the copy into app storage did not work and the app fell back
   to the original file (it still saves, but iOS may purge that file later).
3. **Leave a spot unnamed** and come back to the list a few seconds later: it should read
   `Untitled · <your town> · <time>`.

## Reload, logs, stopping

- Shake the phone (or three-finger long-press) for the Expo menu → **Reload**. Saving a file on the
  desktop reloads the app automatically.
- Logs (including `console.warn`) appear in the Metro terminal.
- Stop Metro with Ctrl+C. The phone keeps nothing running.

## Where the data lives on the phone

Inside Expo Go's sandbox for this project: the SQLite database `hit_list.db` and the photos under
`Documents/…/photos/<spotId>/<photoId>.jpg` (the database stores only the relative path
`photos/<spotId>/<photoId>.jpg`). Removing the project from Expo Go, or deleting Expo Go, deletes
both. Nothing is written to the camera roll.

## If something is off

- **The QR code opens nothing / times out**: Tailscale is off on one side, or the phone is on a
  network that blocks it. `tailscale status` on the desktop; toggle Tailscale on the phone.
- **"Project is incompatible with this version of Expo Go"**: Expo Go moved to a newer SDK. The
  upgrade is one hop with the same recipe used tonight (`npx expo install expo@^58 && npx expo install
  --fix`, then typecheck, tests and `npx expo export --platform ios`); see `CLAUDE.md`.
- **Port 8081 busy**: `lsof -i :8081`; stop the other Metro, or run
  `REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale ip -4) npx expo start --port 8082`.

## Later: an app that does not need the desktop

You have an Apple developer account, so the next step is an EAS development build installed through
TestFlight: `eas login` (you run this), then `eas build --profile development --platform ios`. That
build no longer needs Metro on the desktop for the installed version, and it is also when Mapbox and
offline map tiles become possible.
