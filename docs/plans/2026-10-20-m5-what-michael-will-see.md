# M5: what Michael will see (Spots tab list, sort row, Filter sheet, map callout)

Rendered from scratch in Jest (a temporary test, deleted before commit; trees trimmed to the props a user or VoiceOver meets).

## List rows (`SpotListItem`)

Every row is `role=button`. Since M5-05 its label reads the name, type, 'Skate stopped', 'Natural speed: <word>' and distance, joined with ', ' (e.g. 'Downtown Rail, Rail +2, Skate stopped, Natural speed: Too much, 2.3 mi'); the type badge is a small pill `Tag` like Stopped.

**1. Three types + stopped + speed Too much** (photo)
```
[photo]  Pier 57 rail                       (2 lines max)
         [Rail +2]  [Stopped (red, small)]  ▮▮▮▮▮ Too much
```
Bar: `label="Natural speed: Too much"`, cells 0–4 all selected, 12-pt word.

**2. Untagged, photo, no speed**
```
[photo]  Untitled · Seattle · Oct 13, 2:22 PM
         (empty badge row: no type, no Stopped, no bar)
```

**3. One type, no photo, speed Some**
```
[No Photo]  Library ledge
            [Ledge]  ▮▮▮▯▯ Some        (label "Natural speed: Some"; cells 0–2 selected)
```

## Sort row (`SortChips`, horizontal scroll)

Order: **Distance · Date · Name**.

| Case | Chips |
|---|---|
| Distance active, with location | `Distance ↑` (selected, "Sort by Distance, nearest first", hint "Double-tap to reverse") · `Date` · `Name` |
| Date active, no location | `Distance` (disabled, hint "Needs your location") · `Date ↓` (selected, "newest first") · `Name` |

## Filter sheet (modal)

Header "Filters" + Reset; scrolling body; Apply button at the bottom.

**Nothing set**
```
What's here      8 checkboxes, all unchecked: Rail, Ledge, Bank, Hip, Stair set, Gap, Wall ride, Quarter pipe
Skate stopped    tablist: [Any (selected)] [Not stopped] [Stopped]
Natural speed    None · Little · Some · Enough · Too much   (none selected, hint "Double-tap to start a range here")
                 summary "Any"  (label "Natural speed: Any")
```

**All three set** (Rail + Ledge, Stopped, Little–Enough)
```
What's here      Rail ✔, Ledge ✔, the other six unchecked
Skate stopped    [Any] [Not stopped] [Stopped (selected)]
Natural speed    Little, Some, Enough selected (hint "Double-tap to clear the range"); None and Too much not
                 summary "Little to Enough"  (label "Natural speed: Little to Enough")
```

## Map callout (`Marker` props, two spots)

| Spot | testID | coordinate | title | description | pinColor |
|---|---|---|---|---|---|
| Named, Rail + Ledge + Bank | `spot-marker-s1` | 47.6062, -122.3321 | `Pier 57 rail` | `Rail · Ledge · Bank` | `#007AFF` |
| Unnamed, untagged | `spot-marker-s2` | 45.5152, -122.6784 | `Untitled · Oct 21, 5:32 PM` | *(none)* | `#007AFF` |

Both have `onCalloutPress` (opens the spot). The unnamed spot has no town here because the test spot had no `generated_name`.

## Known gaps

- Fixed in M5-05: the row's VoiceOver label now reads every tag (it was the name only).
- None of this ran on a device; layout (badge wrapping, 12-pt word, callout look in Apple Maps) is untested by eye.

## Try on the phone

- [ ] Spots tab: rows show the badge row as above; an untagged spot shows no badges.
- [ ] Sort row order Distance · Date · Name; Distance is greyed out without location.
- [ ] Filter sheet: pick Little then Enough → range "Little to Enough"; Apply → list narrows; Filter shows "(3)" with all three set.
- [ ] Map: tap a pin → callout reads name + "Rail · Ledge"; tap the callout → spot opens.

## Verification numbers

- `npx jest --silent`: 47 suites, **584 tests** passed.
- `npx expo export --platform ios --output-dir /tmp/hl-export-m504`: exit **0**.
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green via `check.sh`.
