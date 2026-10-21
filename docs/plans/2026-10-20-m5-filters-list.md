# M5 plan: three-filter sheet, SpeedScale range mode, list rows and map callouts

Spec: `docs/specs/2026-10-16-simplification-design.md` §2.3 (SpeedScale, range mode), §2.5 (Filter sheet,
`SpotFilters`), §2.6 (list row, map callout). Features: M5-01 this plan + store semantics · M5-02 sheet + range
mode · M5-03 list row + callout · M5-04 walkthrough · M5-05 review. Each task: RED test first, then code;
`check.sh` green per commit.

Starting point (after M4): store already filters on all three (`selectFilteredSpots`) and counts all three
(`selectActiveFilterCount`); the sheet shows **only** What's here chips; `SpeedScale` has edit + `readonly` forms;
`SpotListItem` shows name, one type badge (`featureTypesLabel`, "Rail +1"), distance; Marker description =
`featureTypesLabel` ("Rail +1"), pin `SPOT_PIN`.

## M5-01 store semantics (done in this feature)

`SpotFilters` unchanged (`types`, `stopped?`, `natural_speed_min?`, `natural_speed_max?`; `DEFAULT_FILTERS = { types: [] }`).

| Filter | Rule | Test (`stores.test.ts`) |
|---|---|---|
| types | any-of against `feature_types`; `[]` = all | 'filters by type', 'types is any-of…' |
| stopped | `undefined` keeps all · `true` only stopped · `false` only not stopped | 'stopped: undefined keeps every spot…', 'stopped: true…', 'stopped: false…' |
| speed | `min ≤ speed ≤ max`, either end optional; **unrated kept**; 0 real | 'min 1 and max 3 keep speeds 1, 2, 3 and unrated, and drop 0 and 4', 'treats 0 as a real value…' |
| count | 1 per filter set: types non-empty · stopped `!== undefined` · min or max `!== undefined` | `{types:[rail]}` 1 · `{stopped:false}` 1 · `{min:0,max:2}` 1 · `{max:0}` 1 · all three 3 · default 0 |
| setFilters | shallow merge; an **explicit `undefined` clears** (Any), unlike `SpotUpdate` where undefined keeps | 'an explicit undefined clears stopped and the speed range…' |

Count used `!= null`; now `!== undefined` (project rule for speed). Mutation check: count by truthiness → the
`{min:0,max:2}` test fails.

## FilterSheet layout (M5-02)

`src/components/FilterSheet.tsx`, pageSheet modal, unchanged shell (header 'Filters' + Reset; footer Apply; pending
state seeded from the store on each open, written only on Apply). ScrollView body, top to bottom, exactly three
section labels:

1. **What's here**: `ChipGroup` of the eight `FEATURE_TYPE_LABELS` chips (unchanged).
2. **Skate stopped**: existing `SegmentedControl` (tablist/tab), segments `Any` · `Not stopped` · `Stopped`,
   string values `'any' | 'not-stopped' | 'stopped'` ↔ `undefined | false | true` (two tiny maps in the sheet).
3. **Natural speed**: `<SpeedScale rangeValue={…} onRangeChange={…} />`; description line under it.

- Store ↔ range: seed `rangeValue = min === undefined && max === undefined ? undefined : [min ?? 0, max ?? 4]`.
  `onRangeChange(r)` → pending `{ natural_speed_min: r?.[0], natural_speed_max: r?.[1] }` — keys **always present**
  (explicit undefined), so Apply's merge clears an old range.
- Stopped segment → pending `{ stopped }` with the key always present, same reason.
- Apply: `setFilters(pending)`, close. Reset: `resetFilters()` + pending `{ ...DEFAULT_FILTERS }`, sheet stays open
  (today's behaviour; search untouched).
- Full range None–Too much (`[0, 4]`) is written as chosen and counts 1 (filters nothing). Builder's call (§10):
  silently turning it into Any would flip the UI under the user's finger.

## SpeedScale range mode API (M5-02)

```ts
type SpeedScaleProps =
  | { value?: NaturalSpeed; onChange?: (v: NaturalSpeed | undefined) => void; readonly?: boolean }   // today
  | { rangeValue?: [NaturalSpeed, NaturalSpeed]; onRangeChange: (r: [NaturalSpeed, NaturalSpeed] | undefined) => void };
```

Range mode = `onRangeChange` passed. `SpeedScale` becomes a dispatcher over three internal components
(`SpeedBar` readonly, `SpeedPicker` single, `SpeedRangePicker` range) so the range picker's `useState` is not behind
an early return (rules of hooks). Segment row + styles shared.

Tap rules (pure `nextSpeedRange(range, anchor, tapped) → { range, anchor }` in `src/utils/speed-range.ts`, unit
tested; the component keeps `anchor` in `useState`; an anchor counts only while `range` is `[anchor, anchor]`, so
an outside Reset drops it without an effect):

| State | Tap `t` | Emits | Anchor after |
|---|---|---|---|
| no range | t | `[t, t]` (Apply after one tap works) | t |
| anchor `a` (range `[a, a]`) | t ≠ a | `[min(a,t), max(a,t)]` (high-before-low ok) | none |
| anchor `a` | t = a | `[a, a]` (just that value) | none |
| complete range, t inside | t | `undefined` (third tap clears) | none |
| complete range, t outside | t | `[t, t]` (new range) | t |

Examples (M5-02 tests): Little, Enough → `[1, 3]`; Some, Some → `[2, 2]`; Enough, Little → `[1, 3]`; `[2,2]` + Some →
`undefined`.

Description line: `undefined` → 'Any'; `[a, a]` → `SPEED_LABELS[a].label` ('Some'); `[a, b]` → 'Little to Enough'.
Segments inside the range are filled `palette.blue[500]`. A11y: row has no radiogroup role; each segment
`accessibilityRole="button"`, `accessibilityState={{ selected: inRange }}`, label `"<label>: <description>"`, hint:
'Double-tap to start a range here' / 'Double-tap to end the range here' (anchor set; the anchor itself:
'Double-tap to select just this one') / 'Double-tap to clear the range' (inside a complete range). Built (M5-02): the
description line is labelled 'Natural speed: <range>'; the props union uses `?: never` so the two modes cannot mix.

## List row (M5-03)

`SpotListItem` props: `{ id, displayName, thumbnailUri?, featureType?, stopped, naturalSpeed?, distance?, onPress }`,
still `memo` (primitives only, so memo holds). Content column: name (`numberOfLines={2}`) · badge row
(`flexDirection: 'row'`, **`flexWrap: 'wrap'`**, `alignItems: 'center'`): type badge ('Rail +2', `featureTypesLabel`),
`Tag label="Stopped" tone="stopped"` when `stopped`, `<SpeedScale readonly value={naturalSpeed} />` (renders
nothing when unrated; a11y label 'Natural speed: Too much') · distance on its own line below, so a wrapping badge
row never pushes it off. Row `accessibilityLabel` stays `displayName` (tests and VoiceOver read the name; M5-05
reviews whether to append the tags). `app/(tabs)/index.tsx` `renderItem` passes `stopped={item.stopped}`
`naturalSpeed={item.natural_speed}`.

## Map callout (M5-03)

`Marker description = spot.feature_types.map((t) => FEATURE_TYPE_LABELS[t]).join(' · ') || undefined` — new
`featureTypesList(spot)` in `src/utils/spot-name.ts` next to `featureTypesLabel` (list keeps "Rail +2"; the callout
has room for all). Title `getSpotDisplayName(spot)`, `pinColor={SPOT_PIN}` unchanged. Existing test 'shows the
feature types label in the callout' changes 'Rail +1' → 'Rail · Ledge'.

## Test list

| File | Feature | Cases |
|---|---|---|
| `stores.test.ts` | M5-01 ✔ | table above |
| `speed-range.test.ts` (new) | M5-02 | every row of the tap table; anchor ignored when range ≠ `[a, a]` |
| `speed-scale.test.tsx` | M5-02 | range: undefined → none selected + 'Any'; Little, Enough → `[1,3]` + 'Little to Enough'; Some ×2 → `[2,2]` + 'Some'; Enough, Little → `[1,3]`; `[2,2]` + Some → undefined; in-range segments `selected`; edit and readonly cases unchanged |
| `filter-sheet.test.tsx` | M5-02 | labels exactly What's here / Skate stopped / Natural speed; tabs Any / Not stopped / Stopped; Stopped + Rail + Little–Enough + Apply → `{ types: ['rail'], stopped: true, natural_speed_min: 1, natural_speed_max: 3 }`; Reset → `DEFAULT_FILTERS`; stored filters pre-selected (tab, chips, range description); Any after stored Stopped clears it on Apply |
| `spots-sort-search.test.tsx` | M5-02 | badge 'Filter spots, 3 active' with all three set; 'Reset filters' empty-state action with stopped / speed filters |
| `spot-list.test.tsx` | M5-03 | 'Rail +2'; 'Stopped' only when stopped; 'Natural speed: Too much' label; none when unrated; `numberOfLines` 2; distance unchanged |
| `spot-map.test.tsx` | M5-03 | 'Rail · Ledge'; `[]` → undefined; every pin `SPOT_PIN`; title = display name |

## Unresolved questions

None for Michael. Builder's calls recorded above: first tap emits `[t, t]`; tap outside a complete range starts a
new one; `[0, 4]` kept as chosen.
