# Informative untitled names, EXIF fixes, location on the list — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Tonight's runbook (`OVERNIGHT.md`) fixes the execution method: **executing-plans, inline**.

**Goal:** Imported photos keep their real date and hemisphere; unnamed spots read
`Untitled · Seattle · Oct 13, 2:22 PM`; the Spots list knows where the phone is, so distances show.

**Architecture:** Two pure modules (`src/utils/exif.ts`, a rewritten `src/utils/spot-name.ts`), one
thin wrapper over `expo-location` reverse geocoding (`src/utils/reverse-geocode.ts`), one hook that
asks for location once (`src/hooks/use-current-location.ts`). `expo-location` gets one global jest
mock in `jest.setup.ts` copied from its `.d.ts`, because the Spots screen now touches it.

**Tech Stack:** expo-location 57 (`requestForegroundPermissionsAsync`, `getLastKnownPositionAsync`,
`getCurrentPositionAsync`, `reverseGeocodeAsync`), zustand 5, Jest 29 + jest-expo.

**Spec:** `docs/specs/2026-10-13-overnight-design.md` — D4; §1.4 bugs 3, 4, 5; §2.2 "M6".

## Global Constraints

- D4 placeholder, exactly: `Untitled · <Town> · Oct 13, 2:22 PM` when `generated_name` is set, else
  `Untitled · Oct 13, 2:22 PM`. A user-given `name` always wins. The town is stored in
  `generated_name`. Built by hand (month table, 12-hour clock), not `toLocaleString`, so it is the
  same in Hermes and Node and never contains ICU's narrow no-break space.
- Times render in the phone's local zone. Tests that assert a time set `process.env.TZ` explicitly.
- Reverse geocoding: on-device (`reverseGeocodeAsync`), `city` → `subregion` → `region` →
  `undefined`, every error swallowed; ≤ 10 backfills per launch, sequential, only spots with neither
  `name` nor `generated_name`, never for the unknown location (0, 0), and never blocking launch.
- EXIF date `YYYY:MM:DD HH:MM:SS` → `YYYY-MM-DDTHH:MM:SS` (local, no zone); invalid → `undefined`.
- EXIF GPS: apply the `S`/`W` sign only when the ref is present and the value is positive.
- `expo-location` mock members/signatures copied from `node_modules/expo-location/build/Location.d.ts`
  and `Location.types.d.ts`.
- Gates per task: jest, typecheck, lint = 0, zero `console.error`; milestone adds `expo export`.

## Review Focus

1. **Permission denied** (or the location prompt dismissed) → no crash, no retry loop, list shows no
   distances, map still opens; geocoding of new spots still runs (iOS's geocoder needs no permission)
   and fails silently if offline. (Tasks 3, 4.)
2. **A photo with no EXIF at all, or EXIF without GPS** → the photo is still imported, dated "now",
   in the "no location" group; nothing reads `undefined.DateTime`. (Task 1.)
3. **Offline / geocoder rate limit during the launch backfill** → launch is not delayed, the spots
   keep their `Untitled · <time>` label, and the next launch tries again. (Task 3.)
4. **A spot whose `created_at` is an EXIF-derived local time** (no `Z`) next to ISO-`Z` spots → the
   label shows the photo's local wall-clock time, and sorting still works. (Tasks 1, 2.)
5. **Midnight and noon** → `12:05 AM` / `12:05 PM`, never `0:05`. (Task 2.)

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/utils/exif.ts` (new) | `parseExifDate`, `exifGps`, `importPhotoFromAsset` |
| `app/import/index.tsx:31-39` | build `ImportPhoto`s with `importPhotoFromAsset` |
| `src/utils/spot-name.ts` | D4 `getSpotDisplayName`, `formatSpotTime` |
| `src/utils/reverse-geocode.ts` (new) | `geocodeTown(point)` |
| `jest.setup.ts` | global `expo-location` mock |
| `src/hooks/use-db-init.ts` | ≤ 10-per-launch backfill after ready |
| `app/add/review.tsx`, `app/import/review.tsx` | fire-and-forget geocode after save |
| `src/hooks/use-current-location.ts` (new) | permission once → location store |
| `app/(tabs)/index.tsx` | mount `useCurrentLocation()` |

---

### Task 1: EXIF date + GPS sign (bugs 3, 4)

**Interfaces — Produces:** `parseExifDate(raw: unknown): string | undefined`;
`exifGps(exif: Record<string, unknown> | null | undefined): GeoPoint | null`;
`importPhotoFromAsset(asset: { uri: string; exif?: Record<string, unknown> | null }, nowIso: string): ImportPhoto`.

- [ ] **Step 1: Failing tests** `src/__tests__/exif.test.ts`:

```ts
describe('parseExifDate', () => {
  it('turns EXIF colons into an ISO local time', () => {
    expect(parseExifDate('2026:10:13 14:22:01')).toBe('2026-10-13T14:22:01');
  });
  it.each([undefined, null, '', 'garbage', '2026:13:45 99:99:99', 42])('rejects %p', (v) => {
    expect(parseExifDate(v)).toBeUndefined();
  });
});
describe('exifGps', () => {
  it('applies S and W refs to positive values', () => {
    expect(exifGps({ GPSLatitude: 47.6, GPSLatitudeRef: 'N', GPSLongitude: 122.3, GPSLongitudeRef: 'W' }))
      .toEqual({ latitude: 47.6, longitude: -122.3 });
    expect(exifGps({ GPSLatitude: 33.9, GPSLatitudeRef: 'S', GPSLongitude: 151.2, GPSLongitudeRef: 'E' }))
      .toEqual({ latitude: -33.9, longitude: 151.2 });
  });
  it('keeps already-signed values when the ref is missing or the value is negative', () => {
    expect(exifGps({ GPSLatitude: 47.6, GPSLongitude: -122.3 })).toEqual({ latitude: 47.6, longitude: -122.3 });
    expect(exifGps({ GPSLatitude: 47.6, GPSLongitude: -122.3, GPSLongitudeRef: 'W' })).toEqual({ latitude: 47.6, longitude: -122.3 });
  });
  it('returns null without both coordinates', () => {
    expect(exifGps({ GPSLatitude: 47.6 })).toBeNull();
    expect(exifGps(undefined)).toBeNull();
  });
});
describe('importPhotoFromAsset', () => {
  const now = '2026-10-15T01:00:00.000Z';
  it('prefers DateTimeOriginal, then DateTime, then now', () => {
    expect(importPhotoFromAsset({ uri: 'u', exif: { DateTimeOriginal: '2026:10:13 14:22:01', DateTime: '2026:10:14 09:00:00' } }, now).capturedAt).toBe('2026-10-13T14:22:01');
    expect(importPhotoFromAsset({ uri: 'u', exif: { DateTime: 'garbage' } }, now).capturedAt).toBe(now);
  });
  it('imports a photo with no EXIF at all, dated now, with no location', () => {
    expect(importPhotoFromAsset({ uri: 'u', exif: null }, now)).toEqual({ uri: 'u', location: null, capturedAt: now });
  });
});
```
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/utils/exif.ts`: regex `^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$`,
  range-check month 1–12, day 1–31, hour ≤ 23, minute/second ≤ 59; `exifGps` reads numbers only
  (`typeof v === 'number' && Number.isFinite(v)`), negates when ref is `S`/`W` and value > 0.
  `app/import/index.tsx`: `const now = new Date().toISOString();` then
  `result.assets.map((a) => importPhotoFromAsset(a, now))`.
- [ ] **Step 4: Run** → PASS; `import.test.ts` still green. **Commit** — `fix: EXIF dates become ISO and GPS refs set the hemisphere (bugs 3, 4)`.

### Task 2: D4 placeholder

**Interfaces — Produces:** `formatSpotTime(iso: string): string` (`Oct 13, 2:22 PM`; `''` for an
invalid date); `getSpotDisplayName(spot)` per D4.

- [ ] **Step 1: Failing tests** — replace the two old expectations (`spot-list.test.tsx:70-78`,
  `utils.test.ts:69-79`) and add `src/__tests__/spot-name.test.ts` with `process.env.TZ = 'America/New_York'`
  set at the top of the file (before any Date is built):

```ts
it('uses the name when set', () => expect(name({ name: 'Pier 57' })).toBe('Pier 57'));
it('shows town and time for an untitled spot with a town', () =>
  expect(name({ generated_name: 'Seattle', created_at: '2026-10-13T18:22:00.000Z' })).toBe('Untitled · Seattle · Oct 13, 2:22 PM'));
it('shows only the time without a town', () =>
  expect(name({ created_at: '2026-10-13T18:22:00.000Z' })).toBe('Untitled · Oct 13, 2:22 PM'));
it('shows an EXIF local time as wall-clock time', () =>
  expect(name({ created_at: '2026-10-13T14:22:01' })).toBe('Untitled · Oct 13, 2:22 PM'));
it.each([['2026-10-13T04:05:00.000Z', 'Oct 13, 12:05 AM'], ['2026-10-13T16:05:00.000Z', 'Oct 13, 12:05 PM']])(
  'formats %s as %s', (iso, out) => expect(formatSpotTime(iso)).toBe(out));
it('never shows "Invalid Date"', () => expect(name({ created_at: 'nope' })).toBe('Untitled'));
```
  (`const name = (o) => getSpotDisplayName(createTestSpot(o))`.) Check whether changing `TZ` at
  runtime takes effect in this Jest worker (Node ≥ 13 re-reads it); if not, set it via a
  `testEnvironmentOptions`-free route such as a per-file `jest.isolateModules` — ruling.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** in `src/utils/spot-name.ts`
  (`const MONTHS = ['Jan', …, 'Dec']`; `h % 12 || 12`; `String(m).padStart(2, '0')`;
  parts joined with `' · '`). **Step 4: Run** → PASS; full suite (grep other tests for
  `Untitled Spot` and update them). **Commit** — `feat: untitled spots show town and time (D4)`.

### Task 3: Town from the on-device geocoder

**Interfaces — Produces:** `geocodeTown(point: GeoPoint): Promise<string | undefined>`;
`backfillTowns(db, spots, updateSpot, limit = 10): Promise<void>` (exported from
`src/utils/reverse-geocode.ts`, called by `useDbInit` after `setIsReady(true)`).

- [ ] **Step 1: Global mock** in `jest.setup.ts`, members from `Location.d.ts`:

```ts
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied', granted: false, canAskAgain: true, expires: 'never' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied', granted: false, canAskAgain: true, expires: 'never' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => { throw new Error('location unavailable in tests'); }),
  reverseGeocodeAsync: jest.fn(async () => []),
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
}));
```
  and delete the local `expo-location` mock in `screens.test.tsx` (keep its denied default behaviour).
- [ ] **Step 2: Failing tests** `src/__tests__/reverse-geocode.test.ts`:

```ts
it.each([
  [[{ city: 'Seattle', subregion: 'King County', region: 'WA' }], 'Seattle'],
  [[{ city: null, subregion: 'King County', region: 'WA' }], 'King County'],
  [[{ city: null, subregion: null, region: 'WA' }], 'WA'],
  [[], undefined],
])('picks city → subregion → region (%#)', async (result, town) => {
  jest.mocked(reverseGeocodeAsync).mockResolvedValueOnce(result as never);
  await expect(geocodeTown({ latitude: 47.6, longitude: -122.3 })).resolves.toBe(town);
});
it('swallows geocoder errors', async () => {
  jest.mocked(reverseGeocodeAsync).mockRejectedValueOnce(new Error('rate limited'));
  await expect(geocodeTown({ latitude: 47.6, longitude: -122.3 })).resolves.toBeUndefined();
});
it('skips the unknown location (0, 0)', async () => {
  await expect(geocodeTown({ latitude: 0, longitude: 0 })).resolves.toBeUndefined();
  expect(reverseGeocodeAsync).not.toHaveBeenCalled();
});
it('backfills at most 10 untitled, town-less spots, one at a time', async () => {
  jest.mocked(reverseGeocodeAsync).mockResolvedValue([{ city: 'Seattle' }] as never);
  const spots = [
    ...Array.from({ length: 12 }, () => createTestSpot()),
    createTestSpot({ name: 'named' }),
    createTestSpot({ generated_name: 'Tacoma' }),
  ];
  const update = jest.fn(async () => {});
  await backfillTowns(spots, update);
  expect(reverseGeocodeAsync).toHaveBeenCalledTimes(10);
  expect(update).toHaveBeenCalledTimes(10);
  expect(update).toHaveBeenCalledWith(spots[0].id, { generated_name: 'Seattle' });
});
```
  (Signature therefore `backfillTowns(spots, updateSpot, limit = 10)` — no `db` parameter; the
  caller passes `useSpotActions().updateSpot`-equivalent. Ruling if this simplifies further.)
  In `db-init.test.ts`: `it('backfills towns after launch without delaying ready')` — 12 town-less
  spots from `getSpots`, `reverseGeocodeAsync` resolving `[{ city: 'Seattle' }]`, `isReady` true after
  one `flushInit`, then `waitFor` 10 geocode calls. In `review-persist.test.tsx`: after a Quick Add
  save with `reverseGeocodeAsync → [{ city: 'Seattle' }]`, the DB mock's `updateSpot` gets
  `{ generated_name: 'Seattle' }` (add `updateSpot` to that file's `@/src/db` mock).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** `geocodeTown` (`try { const [a] = await
  reverseGeocodeAsync(point); return a?.city ?? a?.subregion ?? a?.region ?? undefined } catch { return undefined }`,
  early return for 0,0), `backfillTowns` (`for … of` over the first `limit` eligible spots, `await`
  each). `useDbInit`: after `setIsReady(true)`, `void backfillTowns(spots, updateSpotAndStore)` where
  `updateSpotAndStore = (id, u) => { storeUpdateSpot(id, u); return dbUpdateSpot(db, id, u).catch(() => {}) }`.
  Review screens: after `addSpot(spot)` (and before `dismissAll`), `void geocodeTown(spot.location)
  .then((town) => town && updateSpot(spot.id, { generated_name: town }))` using `useSpotActions().updateSpot`.
- [ ] **Step 5: Run** → PASS; full suite. **Commit** — `feat: towns from the on-device geocoder for untitled spots (D4)`.

### Task 4: Location on the Spots list (bug 5)

**Interfaces — Produces:** `useCurrentLocation(): void` — once per mount: request foreground
permission; store status; if granted, set the last known position (fast), then the current one
(`Accuracy.Balanced`); all errors swallowed.

- [ ] **Step 1: Failing tests** `src/__tests__/use-current-location.test.tsx` and a Spots screen test:

```tsx
it('fills the location store when permission is granted', async () => {
  jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce({ status: 'granted', granted: true } as never);
  jest.mocked(getCurrentPositionAsync).mockResolvedValueOnce({ coords: { latitude: 47.61, longitude: -122.33 } } as never);
  renderHook(() => useCurrentLocation());
  await waitFor(() => expect(useLocationStore.getState().currentLocation).toEqual({ latitude: 47.61, longitude: -122.33 }));
  expect(useLocationStore.getState().permissionStatus).toBe('granted');
});
it('records a denial and never asks for a position', async () => {
  renderHook(() => useCurrentLocation());
  await waitFor(() => expect(useLocationStore.getState().permissionStatus).toBe('denied'));
  expect(getCurrentPositionAsync).not.toHaveBeenCalled();
});
it('the Spots list shows a distance once the location is known', async () => {
  jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce({ status: 'granted', granted: true } as never);
  jest.mocked(getCurrentPositionAsync).mockResolvedValueOnce({ coords: { latitude: 47.6062, longitude: -122.3321 } } as never);
  useSpotsStore.setState({ spots: [createTestSpot({ name: 'Near', location: { latitude: 47.6072, longitude: -122.3321 } })] });
  render(<SpotsScreen />);
  expect(await screen.findByText(/ft|mi/)).toBeTruthy();   // imperial default; match formatDistance's real output
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the hook (effect with an `active` flag so an
  unmounted screen never writes) and call it at the top of `SpotsScreen`.
- [ ] **Step 4: Run** → PASS; full suite (no new `console.error`: the denied default only touches
  `permissionStatus`, which the Spots screen does not select); `npx expo export --platform ios` → 0.
  **Commit** — `fix: the Spots tab asks for location so distances and the map's "me" work (bug 5)`.

---

## After the tasks (runbook M6 close-out)

"What Michael will see" table (names: user-given, untitled-with-town, untitled-without; one distance).
Fresh review on the most capable model, fix Critical/Important RED→GREEN, `/simplify`, tick, log, push.
