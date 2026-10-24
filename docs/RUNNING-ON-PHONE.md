# Running HitList on the iPhone (Expo Go over Tailscale)

HitList runs in **Expo Go** on the iPhone, served by Metro on the Pop!_OS desktop over the tailnet.
No App Store build, no Mac, no Apple login is needed for this. (A TestFlight build that runs without
the desktop is the next step; see "Later" at the bottom.)

## What you need

- **Expo Go** from the App Store, **SDK 57** (the version Expo Go ships today; the project is on
  SDK 57). If the App Store version moves to SDK 58, see "Project is incompatible with this version
  of Expo Go" under "If something is off".
- **Tailscale** on both the desktop (`pop-os`, `100.88.90.97`) and the phone (`iphone-15`), both
  connected. Check with `tailscale status` on the desktop: `iphone-15` must not say "offline".

## Start it

On the desktop:

```bash
cd ~/projects/hit_list
git switch main
npm ci                              # first time, or after the packages change
npm run start:tailscale
```

Metro prints a QR code and the address `exp://100.88.90.97:8081`. On the phone, open the iPhone
Camera, point it at the QR code and tap the banner; it opens in Expo Go. (Or in Expo Go: "Enter
URL manually" → `exp://100.88.90.97:8081`.) The first load bundles about 9 MB of JavaScript and
takes a little while; later loads are quick.

## What to expect

- **Spots tab, List** (default): every spot with a thumbnail (its main photo, or "No Photo"), what's
  there (e.g. "Rail +1") once tagged, a small red "Stopped" tag when skate stopped, the natural speed bar once rated,
  and a distance once you allow location. Unnamed spots read
  `Untitled · Seattle · Oct 13, 2:22 PM` (the town arrives a moment after saving, from Apple's
  geocoder: it needs internet, and the spot's coordinates are sent to Apple to look it up) or `Untitled · Oct 13, 2:22 PM` without a town.
- **Search and sort** (Spots tab): the search field under List | Map finds spots by name or town, in
  both views. In List, the chips sort by Distance, Date or Name. Tap the active chip again
  to reverse it. Distance works once you allow location. Spots without a location or name
  stay at the bottom, whichever way the sort runs.
- **Filter** (Spots tab, top right of the header): a sheet with three filters: What's here (chips, any of them),
  Skate stopped (Any / Not stopped / Stopped) and Natural speed (tap a low and a high word for a range; tap one word
  twice for just that one; tap again to clear). Apply; the button shows how many are set. Spots never rated for speed
  stay in. Reset (in the sheet) or 'Reset filters' (under "No matching spots") clears all three.
- **Spots tab, Map**: the List | Map switch under the header. Apple Maps, one blue pin per spot. Tap a pin (its bubble lists the
  feature types, e.g. "Rail · Ledge"), then the bubble, to open the spot. Spots saved without GPS appear in the list but not on the map. Nearby
  spots show as one numbered blue circle. Tap it to zoom in. If the spots are at the same place,
  tapping it lists them by name instead. Pick one to open it.
- **+ button**: camera → take photos → name it or leave it blank → Save. The photos are
  copied into the app's own storage, so they stay after iOS clears its caches.
- **Add details** (on the + button's review screen): a link under the name that opens the three tags (what's
  here, Skate stopped, natural speed); the fast path stays photo → Save. If a spot you already have is within the
  Import Radius, an 'Already have this spot?' card lists up to three ('Near Library Rail · 16 ft') with **Add photos there**.
- **Import Photos** (Spots tab, the small photo button above +): it opens an "Import Photos" screen;
  tap **Select Photos** to open the library picker. Photos are grouped by GPS only: photos within the
  Import Radius of each other (Profile tab, 50 m by default) become one spot. Photos without GPS get
  a spot each. Each spot's date is the capture time of its first photo.
- **Spot detail**: the main photo large, the rest in rows of three underneath. In Edit, tap the × on a photo and
  Save to take it off the spot (the file stays in the app's storage). A note shows how many photos
  will be removed, with an Undo. Swipe the sheet away without Save and the photo stays.
- **Edit** (from a spot): one screen: photo grid (✕ removes, '+' adds from the library; both are written on Save),
  name, tags, notes, Delete. A spot with older data (dimensions, material, old scores…) shows it under a collapsed
  **Older details** on the detail screen, in your units.
- **Photo viewer**: tap any photo on the detail screen. It opens full screen on black at that photo, with
  "3 / 7" at the top and a ✕ to close (the status bar comes back when it closes). Swipe sideways between
  photos; pinch to zoom (up to 4×) and drag around while zoomed (sideways swipes stop changing photo until
  you zoom back out); double-tap to jump to 2.5× and back; swipe down at normal size to close. Long-press a
  photo for **Set as primary** or **Remove photo** (asks first; the next photo takes its place, and removing
  the last one closes the viewer). None of these gestures have been tried on a device yet: see the checklist
  in `docs/plans/2026-10-20-m4-what-michael-will-see.md`.
- iOS asks for **location** when the Spots tab first opens. Saying no is fine: distances stay blank
  and the map just shows the spots.
- **Camera**: the first tap on + shows an in-app "Camera permission required" screen. Tap
  **Grant Permission** to get the iOS prompt. If you decline, the screen offers **Open Settings**
  (turn Camera on for Expo Go there) and a **Close** button back to the list.

## First things to check (they cannot be tested headlessly)

1. **Tap Map.** You should see Apple Maps with pins. A red screen saying "view config not found"
   would mean Expo Go lacks react-native-maps (not expected for SDK 57).
2. **Tap a pin, then tap its bubble.** It should open that spot. If nothing happens, note it.
3. **Make two quick spots at the same place** (+ button, Save twice without moving), then
   open Map and zoom out. You should see one blue circle marked 2. Tap it: a list of the two spot
   names should appear. Pick one: that spot should open. If the map zooms in instead, note it.
4. **Take a photo with the + button**, save, then force-quit Expo Go and reopen the project. The
   photo should still show. While you do this, watch the Metro terminal on the desktop: a line
   `[persistPhoto] copy failed` means the copy into app storage did not work and the app fell back
   to the original file (it still saves, but iOS may purge that file later).
5. **Leave a spot unnamed** and come back to the list a few seconds later: it should read
   `Untitled · <your town> · <time>`.

## With accounts (local stack over Tailscale)

Short version: `npm run db:start` (Docker), put the URL and anon key in `.env.local`, read the code in Mailpit
(`:54324`), look at the data in Studio (`:54323`), and `npm run db:stop` when done.

Without a `.env.local` the app runs signed out only (Profile: 'Accounts aren't set up in this build'). To try
sign-in, the box runs the local Supabase stack (`npm run db:start`), `.env.local` points the app at
`http://100.88.90.97:54321` with the anon key from `npx supabase status`, and the 6-digit code shows up in Mailpit at
`http://100.88.90.97:54324` (nothing is really emailed). Restart Metro after editing `.env.local`. Every step, with what
to check and how to undo it: the S4 section of [`docs/plans/2026-10-22-live-checklist.md`](plans/2026-10-22-live-checklist.md).
Studio (the database browser) is at `http://100.88.90.97:54323`. Stop the stack afterwards with `npm run db:stop`.

## Reload, logs, stopping

- Shake the phone (or three-finger long-press) for the Expo menu → **Reload**. Saving a file on the
  desktop reloads the app automatically.
- Logs (including `console.warn`) appear in the Metro terminal.
- Stop Metro with Ctrl+C. The phone keeps nothing running.

## Where the data lives on the phone

Inside Expo Go's sandbox for this project: the SQLite database `hit_list.db` and the photos under
`Documents/…/photos/<spotId>/<photoId>.jpg` (the database stores only the relative path
`photos/<spotId>/<photoId>.jpg`). Deleting Expo Go deletes both. Nothing is written to the camera
roll.

## If something is off

- **The QR code opens nothing / times out**: Tailscale is off on one side, or the phone is on a
  network that blocks it. `tailscale status` on the desktop; toggle Tailscale on the phone.
- **Metro prints a `192.168.x` or `10.x` address instead of `100.88.90.97`**: Tailscale is down on
  the desktop. `start:tailscale` asks `tailscale ip -4` for the address; when that fails, Expo falls
  back to the LAN address, which the phone cannot reach off your home network. Bring Tailscale up
  (`tailscale status`), stop Metro and start it again.
- **"Project is incompatible with this version of Expo Go"**: Expo Go moved to a newer SDK. The
  upgrade is one hop with the same recipe used tonight (`npx expo install expo@^58 && npx expo install
  --fix`, then typecheck, tests and `npx expo export --platform ios`); see `CLAUDE.md`.
- **Port 8081 busy**: `lsof -i :8081`; stop the other Metro, or run
  `REACT_NATIVE_PACKAGER_HOSTNAME=$(tailscale ip -4) npx expo start --port 8082`.

## Later: an app that does not need the desktop

A development build (`eas build --profile development`) is not that. It is a dev client: it replaces
Expo Go, but it still loads its JavaScript from Metro on the desktop. It is still worth having, since
it is when Mapbox and offline map tiles become possible.

To stop depending on the desktop you need a preview or production build distributed through
TestFlight (store distribution), or EAS Update to send new JavaScript to an installed build. You have
an Apple developer account, so the steps are:

1. `eas login` (you run this).
2. `eas build:configure`. There is no `eas.json` yet, so this comes first; it creates one.
3. A production build for TestFlight: `eas build --profile production --platform ios`, then
   `eas submit --platform ios`.
