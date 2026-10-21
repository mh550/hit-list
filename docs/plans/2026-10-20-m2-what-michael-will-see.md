# M2: what Michael will see on the edit screen

Captured 2026-10-21 from `app/spot/[id]/edit.tsx` rendered in Jest (`screen.toJSON()`, walked in order, in a
temporary test file that was deleted before the commit). Not a pixel render: layout, spacing, fonts and
colours are NOT covered. The nav header title is set by the router and is not part of this render.

## A. Spot with 5 photos, name 'Bridge rail', feature_types [rail, ledge], stopped, natural_speed 3, notes 'low'

Order top to bottom (T = visible text, A = accessibility label/role):

1. Photo grid: hero tile + 4 square tiles, each an `imagebutton` (dimmed, not tappable in edit)
   - A "Photo 1 of 5" … "Photo 5 of 5"
   - each tile has a ✕ badge, A "Remove photo 1" … "Remove photo 5" (role button)
   - last tile: `+` icon, A "Add photos" (role button)
2. Name field: A "Name", value `Bridge rail`, placeholder `Name (optional)`
3. T "What's here"; eight chips (role `checkbox`, label = its text):
   T Rail (checked) · Ledge (checked) · Bank · Hip · Stair set · Gap · Wall ride · Quarter pipe
4. T "Skate stopped"; switch A "Skate stopped", value on
5. T "Natural speed"; radiogroup of five radios:
   - A "None: Flat. You make all the speed."
   - A "Little: Slight slope. Needs a lot of help."
   - A "Some: Some slope. Needs a bit of help."
   - A "Enough: Rolls in with speed for most tricks." (checked, speed 3)
   - A "Too much: Steep. You have to scrub speed."
   - segment texts: None · Little · Some · Enough · Too much
   - description line under the scale: T "Rolls in with speed for most tricks."
6. T "Notes"; field A "Notes", value `low`, placeholder `Anything else`
7. Button T/A "Save"
8. Button T/A "Delete spot"

Control count: 29 (5 tiles + 5 ✕ + Add photos + Name + 8 chips + switch + 5 radios + Notes + Save + Delete).
Text nodes: 20.

## B. Spot with no photos and nothing set

1. Photo grid: only the `+` tile, A "Add photos" (no photo tiles, no ✕)
2. Name field, empty, placeholder `Name (optional)`
3. T "What's here"; the same eight chips, none checked
4. T "Skate stopped"; switch off
5. T "Natural speed"; the same five radios, none checked; line under the scale: T "Not rated"
6. T "Notes"; empty field, placeholder `Anything else`
7. "Save", "Delete spot"

Control count: 19 (Add photos + Name + 8 chips + switch + 5 radios + Notes + Save + Delete).
Text nodes: 20 (the "Not rated" line replaces the speed description).

## Two phone heights (spec §2.2)

Jest cannot measure pixels, so this is argued from control count only. The empty spot has 19 controls and
20 text nodes: a single-row photo grid, two single-line inputs, one multiline Notes, a wrapping chip group
(8 chips, likely 3 rows on a 390 pt phone), one switch row, one 5-segment scale, two buttons. With 5 photos
the grid becomes a 4:3 hero plus two rows of squares (4 photos + `+`, 3 per row), adding roughly
one and a half screen-widths of height. I expect both cases to fit in about two phone heights, but this is
an estimate; Michael should check scroll length on the phone.

## Commands run

- `npx jest --silent`: 42 suites, 425 tests passed; `npx jest --ci` prints 0 `console.error` lines.
- `npx expo export --platform ios --output-dir /tmp/hl-export`: exit 0; one Hermes bundle,
  `entry-….hbc` 4043430 bytes (4 MB); 4.0 MB export directory.
- `/home/mh550/projects/agent-harness/lib/check.sh` (lint + tsc + jest): green.
