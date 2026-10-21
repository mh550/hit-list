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
`naturalSpeed={item.natural_speed}`. Built (M5-03): the row uses `Tag size="small"` and `SpeedScale readonly compact`
(12-pt words, matching the type badge; the full-size Tag/bar looked oversized in a row). Known for M5-05: the
Pressable's `accessibilityLabel` hides the children from VoiceOver, so the tags are not announced yet.

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

## Review (M5-05)

An Opus review of `git diff b55e7ac..f60daff -- . ':!.harness' ':!docs/plans/2026-10-20-m5-what-michael-will-see.md'`
(`b55e7ac` is "HARNESS: M4 verified"), written to `.harness/runs/hit_list-2026-10-20/reviews/m5.diff` (1243 lines).
**No Critical**, **1 Important** (fixed). RED commit `ea1e9a2` before GREEN `6571829`.

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| 1 | Important | `SpotListItem.tsx` Pressable `accessibilityLabel` (was l.35) | The row's label was `displayName` only; a labelled Pressable hides its children, so VoiceOver never read the type, Stopped, speed or distance. | Label = `[name, type, 'Skate stopped', 'Natural speed: <word>', distance]` joined with ', ', empties dropped (0 = None kept). GREEN `6571829`; tests "reads every tag in the row label…" and "labels the row with the name alone…". |
| 2 | Minor | `SpotListItem.tsx` type badge | Custom rounded rectangle next to the pill-shaped `Tag` Stopped: two shapes in one row. | Badge is `<Tag size="small">`; `typeBadge`/`typeText` styles gone. `refactor:` `595e53a`. |
| 3 | Minor | `FilterSheet.tsx` Reset (l.107) | No `accessibilityRole="button"`; VoiceOver read it as text. | Role added. GREEN `6571829`; test "announces Reset and Apply as buttons". |
| 4 | Minor | `SegmentedControl.tsx` `segment` | ~34-pt segments (Any / Not stopped / Stopped, and List / Map) under the 44-pt minimum. | `minHeight: 44` + `justifyContent: 'center'` (shared, so List / Map grows too). GREEN `6571829`; test "gives every segment a 44-pt touch target". |
| 5 | Minor (test gap) | `spots-sort-search.test.tsx` | No empty-state test reset a What's here filter (it worked: `resetFilters` writes `DEFAULT_FILTERS`). | Test '"Reset filters" also clears a What's here filter' (passed on first run, coverage only). |
| 6 | Minor, not fixed | `SpeedScale.tsx` range description | The 'Little to Enough' line is not announced when it changes. | Left: each segment's `selected` state changes and is read on focus; a live region would be Android only. |

### Answers to the M5-05 questions

1. **Range accessibility: yes.** Every segment inside the range has `accessibilityState={{ selected }}` from the
   inclusive `inSpeedRange` (`SpeedScale.tsx` `SpeedRangePicker`; `speed-scale.test.tsx` expects
   `[false, true, true, true, false]` for `[1, 3]`). Role `button` (no radiogroup), label '<word>: <description>', hint
   from `rangeHint` ('Double-tap to start a range here' / 'end the range here' / 'select just this one' / 'clear the
   range'); the summary line is labelled 'Natural speed: Any | Some | Little to Enough'.
2. **Row with everything present: wraps, never clips.** `badgeRow` has `flexDirection: 'row'`, `flexWrap: 'wrap'`,
   `alignItems: 'center'`; the distance is its own `Text` below it in the `flex: 1` column. 'Rail +2' + Stopped + bar
   'Too much' ≈ 264 pt against ≈ 267 pt of content on a 375-pt phone: one line on current iPhones, a second badge line
   at larger Dynamic Type (the row grows past the 72-pt thumbnail; nothing is cut). Test "keeps the two-line name and
   still shows the distance with every tag present".
3. **'Reset filters' empty state: yes, all three.** `app/(tabs)/index.tsx` shows it when `activeFilterCount > 0`
   and runs `resetFilters` (`{ ...DEFAULT_FILTERS }`). Tests in `spots-sort-search.test.tsx` › 'offers a way out':
   stopped ('pressing "Reset filters" restores the default filters…'), speed range ('…also clears a speed range'),
   types ('…also clears a What's here filter').

### Simplification pass (`refactor:` commit `595e53a`)

- `SpotListItem`: the type badge is a small `Tag` (finding 2).
- `FilterSheet`: one `STOPPED_SEGMENTS` table (`label`, `value`, `stopped`) replaces the segments list, the
  `STOPPED_CHOICE` map and the switch in `stoppedChoice`; `StoppedChoice` is derived from it.
- `SpeedRangePicker`: the summary is computed once; `press` hands the raw anchor to `nextSpeedRange` (which checks it
  is live itself) instead of checking twice.
- Not done: dropping `accessibilityState` on the readonly bar's cells (tests read the fill through it) and folding
  `compact` into the bar (detail keeps the 15-pt word).

## Unresolved questions

None for Michael. Builder's calls recorded above: first tap emits `[t, t]`; tap outside a complete range starts a
new one; `[0, 4]` kept as chosen.
