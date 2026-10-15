# CLAUDE.md

Guidance for Claude Code working in this repository.

## Plan Mode
- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## What this is

**HitList**: a mobile-first app for street snowboarders/skateboarders to track "spots" (one rideable
feature at one place: rail, ledge, bank…), with photos, a map, gear/build filters and ratings. Product
spec: `APP_SPECIFICATIONS.md`. Native-only (web is a stub). Runs on Michael's iPhone in Expo Go; see
`docs/RUNNING-ON-PHONE.md`.

## Stack (as of 2026-10-15)

Expo **SDK 57** (expo 57.0.29) · React Native 0.86.3 (New Architecture, Hermes) · React 19.2.3 ·
expo-router 57 · zustand 5 · expo-sqlite 57 · expo-file-system 57 (`File`/`Directory`/`Paths`) ·
expo-location 57 · expo-image · react-native-maps 1.27.2 (Apple Maps) · TypeScript 6.0 strict ·
Jest **29.7** with jest-expo 57 (Jest 30 is not required; keep `@types/jest` 29.5.14) ·
react-test-renderer pinned to 19.2.3 (= React).

## Commands

```bash
npm ci                         # install from the lockfile
npm run start:tailscale        # Metro on the tailnet address → Expo Go on the iPhone
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint (must be 0 errors; no eslint-disable comments)
npx jest --ci                  # all tests (Jest runs with TZ=UTC, see jest.global-setup.js)
npx expo export --platform ios --output-dir /tmp/hl-export   # headless "does it bundle for the phone"
npx expo-doctor                # must be clean
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every branch push.

## Layout

- `app/` expo-router screens: `(tabs)/index.tsx` Spots (List | Map), `(tabs)/profile.tsx`,
  `add/` Quick Add (camera → review), `import/` batch import, `spot/[id]/` detail + edit.
- `src/db/` SQLite access. `schema.ts` holds `MIGRATIONS` (versioned by `PRAGMA user_version`):
  **append a migration, never edit a shipped one**; per-connection pragmas (e.g. `foreign_keys`) go
  next to the WAL line in `migrateDb`, not in a migration.
- `src/stores/` zustand: spots (+ filters, sort, `viewMode`), media (`mediaBySpot`), settings, location.
- `src/hooks/` `useDbInit` (migrate, load spots/media/settings, background town backfill),
  `useSpotActions`, `useMediaActions` (photo save), `useCurrentLocation`.
- `src/utils/` pure logic: filtering, geo (`NO_LOCATION`, `isKnownLocation`, haversine), exif,
  photo-storage, reverse-geocode, spot-name (D4 label), map-region, import-clustering.

## Conventions that are easy to get wrong

- **Dependencies only via Expo**: `npx expo install <pkg>` / `npx expo install --fix`, then
  `npm dedupe` if `expo-modules-core` ends up nested (jest-expo needs it at the root; it must not be a
  direct dependency). Never hand-edit `package-lock.json`, never `--force` / `--legacy-peer-deps`.
  Lockfile changes go in their own `chore:` commit.
- **Photos**: copied into `Paths.document/photos/<spotId>/<mediaId>.jpg`; `media.file_path` stores
  the **relative** path; resolve with `resolvePhotoUri` at display time. Never write to the camera
  roll; files are not deleted on soft delete.
- **No location** is stored as `(0, 0)` (`NO_LOCATION`); always test with `isKnownLocation` (map,
  distance, geocoding).
- **Unnamed spots** display as `Untitled · <Town> · Oct 13, 2:22 PM`; the town lives in
  `generated_name` (Apple's on-device geocoder, ≤ 10 backfills per launch).
- expo-router 57 has no `@react-navigation/*` dependencies; import from `expo-router` /
  `expo-router/js-tabs`.

## Testing

- **TDD**: write the failing test, watch it fail, then the code. Keep `npx jest --ci` green with zero
  `console.error` lines.
- **DB code runs against real SQLite**: `src/__tests__/helpers/node-sqlite-db.ts`
  (`createTestDb` / `createMigratedTestDb`, Node's built-in `node:sqlite`), not mocks.
- **Fakes mirror the real API**: open the package's `.d.ts` in `node_modules` and copy the member
  names and signatures before mocking. Existing fakes: `__mocks__/expo-file-system.ts`
  (+ `helpers/fake-fs.ts` for its test hooks), `__mocks__/react-native-maps.tsx`, and global mocks in
  `jest.setup.ts` (expo-router with overridable `useRouter`/`useLocalSearchParams`, expo-location,
  expo-image, FlashList, icons).
- Only `*.test.ts(x)` files are tests.

## Git

Feature work on a branch, never directly on `main`; `main` gets merged branches only. Small,
descriptive commits. Pushing changes to `.github/workflows/*` over HTTPS needs a token with the
`workflow` scope (`gh auth refresh -h github.com -s workflow`); SSH works regardless.

## AI skills in the repo

`.agents/skills/` holds React Native / React guidelines (`vercel-react-native-skills`,
`vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`); each has a
`SKILL.md` and an `AGENTS.md`. `.playwright-cli/README.md` documents the browser CLI (only relevant
for web tooling).
