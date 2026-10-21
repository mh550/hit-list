# M3: what Michael will see on the detail screen

Captured 2026-10-21 from `app/spot/[id]/index.tsx` rendered in Jest (`screen.toJSON()` walked in order, in a
temporary test file deleted before the commit; units Metric). Not a pixel render: layout, spacing, fonts and
colours are NOT covered. The nav header (title = spot name, right button "Edit", role button) is set by the router
and is not part of this render. T = visible text, A = accessibility label/role.

## A. 7 photos, name 'Bridge rail', types [rail, ledge], stopped, speed 3 (Enough), notes 'low'

1. Photo grid: seven tiles (hero + 6 squares), each role `image`, A "Photo 1 of 7" … "Photo 7 of 7"
   (testIDs `photo-tile-0` … `-6`). No '+' tile, no badges.
2. T "Bridge rail" (title)
3. Tag line: T "Rail" · T "Ledge" · T "Skate stopped" (red-outlined, testID `tag-stopped`). Tags have no role.
4. Speed bar: A "Natural speed: Enough"; four of five cells filled (cells 0–3 selected, cell 4 not); T "Enough"
5. T "Notes"; T "low"
6. No Older details (no archive).

## B. 2 photos, nothing else

1. Photo grid: two tiles, A "Photo 1 of 2", "Photo 2 of 2". No '+' tile.
2. T "Untitled · Oct 21, 4:17 PM" (generated title; the date is the spot's `created_at`)
3. Nothing else: no tag line, no speed bar, no Notes label, no Older details.

Matches the expectation (grid and title only).

## C. Migrated spot, name 'Old spot', no photos, legacy = `fullLegacy` from `fixtures/v2-spots.json` (M1-01)

Closed:
1. A "Add photos" (role button, plus icon) — dashed tile, taps open the edit screen
2. T "Old spot"
3. Button "Older details" (role button, `expanded: false`, chevron-right); nothing below it.
   No tag line, no speed bar, no Notes.

Open (`expanded: true`, chevron-down), label / value rows in order:
Custom type: curved rail · Shape: kinked · Length: 12.5 m · Height: 1.2 m · Width: 0.1 m · Material: steel ·
Stop type: knobs · Stop description: every 50 cm · Removable: Yes · Difficulty: 3/5 · Landing difficulty: 2/5 ·
Landing surface: snow built · Intensity: 5/5 · Bustability: 3/5 · Bustability notes: security at 9pm ·
Setup options: 2 options: winch; drop in platform + 2 speed humps

Things to look at on the phone: width 0.05 m reads "0.1 m" (one decimal); this fixture has no `raw_feature`, so no
trailing raw row; values are lower case as stored.

## Commands run

- `npx jest --silent` / `npx jest --ci`: 43 suites, 458 tests passed, 0 `console.error` lines.
- `npx expo export --platform ios --output-dir /tmp/hl-export`: exit 0.
- `/home/mh550/projects/agent-harness/lib/check.sh` (lint, tsc, jest): green.
