# S2: what Michael will see (area picker, area lists)

Rendered from scratch in Jest (a temporary test, deleted before the commit). Setup: two spots, Near rail at the Seattle centre and Far ledge in Portland; the current location is Seattle; units imperial unless noted. The area list is `Weekend` (centre Seattle, 2 mi, place 'Capitol Hill'); the manual list is `Bridges` (holds Far ledge). Trees trimmed to text, roles, labels, hints and states, in rendered order. The map itself is the mock, so tiles, the circle and the pin appear only as ids.

## 1. Picker, default state (Lists → Area list)

Header: left 'Cancel'; right 'Filter' (label "Filter spots"). No title.
```
[search label="Search a place"] placeholder "Search a place"
[button label="Use my location"] "Use my location"
(map) circle + fixed centre pin (area-center-pin)
radius chips, imperial: [radio] "0.25 mi" · "0.5 mi" · "1 mi" · [radio checked] "2 mi" · "5 mi" · "10 mi" · "25 mi"
"1 spot"
[button label="Save as hit list"] "Save as hit list"
```
- Metric: chips `0.5 km · 1 km · [2 km checked] · 5 km · 10 km · 25 km · 50 km`; the rest is identical.
- Count: '1 spot' here (only Near rail is inside 2 mi); '<N> spots' otherwise, '0 spots' at none. It recounts as the map is dragged or a chip is tapped. There is no Send action yet (S7).

## 2. Picker, 'Save as hit list' chooser (a Modal over the picker)

```
[header] "Save as hit list"
[button label="Just these 1 spot" hint="A normal hit list of the spots inside the circle right now"]
    "Just these 1 spot"   "A normal hit list of the spots inside the circle right now"
[button label="Keep it updated" hint="An area list: your spots inside this circle, now and later"]
    "Keep it updated"     "An area list: your spots inside this circle, now and later"
[button label="Cancel"] "Cancel"
```
'Just these N spots' is hidden at 0 spots. Either option swaps, in the same Modal, to the name card ('New hit list', 'List name', Create); Create closes the chooser and opens `/list/<id>`.

## 3. Lists tab, one area list and one manual list

```
[button label="New hit list"]  (+ icon) "New hit list"
[button label="New area list"] (+ icon) "Area list"
[header] "My hit lists"
[button label="Bridges, 1 spot"]                 "Bridges"  "1 spot"  (chevron)
[button label="Weekend, Area · 2 mi, 1 spot"]    "Weekend"  "Area · 2 mi"  "1 spot"  (chevron)
```
Name order. The area row's count is live (spots inside the circle); the manual row counts memberships.

## 4. Area list screen (Weekend)

Header: title `Weekend` over `Area · 2 mi of Capitol Hill` (one header, label "Weekend, Area · 2 mi of Capitol Hill"); right: 'Rename' (label "Rename list"), 'Filter' (label "Filter spots").
```
[tablist] [tab selected] "List"   [tab] "Map"
[search label="Search spots"] placeholder "Search spots"
[button label="Sort by Distance, nearest first" hint="Double-tap to reverse" selected] "Distance ↑"
[button label="Sort by Date"] "Date"
[button label="Sort by Name"] "Name"
[button label="Near rail, 0 ft"]  "No Photo"  "Near rail"  "0 ft"
[button label="Edit area"]   "Edit area"      (bottom bar)
[button label="Delete list"] "Delete list"    (bottom bar)
```
Far ledge is not shown (outside the circle). 'Edit area' pushes `/area?listId=<id>`. There is no long-press 'Remove from list' on an area list. With no spot inside: 'No spots in this area yet'.

## What to tap (on the phone)

1. Lists tab → '+ Area list' (the picker opens full screen).
2. Drag the map: the circle stays under the centre pin and the count changes. Tap '1 mi': the circle shrinks and the camera fits it.
3. Tap the search field, type 'Capitol Hill', Return: the map jumps there ('No place found' if Apple finds nothing).
4. 'Save as hit list' → 'Keep it updated' → name it → Create. You land on the new list's screen with the two-line title.
5. Back out, Spots tab → Quick Add (+) a spot while standing inside the circle (or a photo geotagged inside it). Open the list: the new spot is there with no further step.
6. On the list screen tap 'Edit area' → pick '5 mi' → 'Save area'. The subtitle now says 'Area · 5 mi' and the count grows.

Check on the phone (the tests can't): `router.replace` from the full-screen picker to the list; the chooser → name card swap with the keyboard up; after 'Use my location' on an unchanged map, whether the next short drag still moves the circle; at 25 mi over all your spots, whether a drag stutters (one pin per spot, not clustered; S2-06 m5); 'Edit area' then Cancel leaves the Spots tab's own filters as they were.

## Checks recorded

- `npx jest --silent`: 67 suites, 919 tests passed, 0 failed. `npx jest --ci` prints 0 `console.error` lines.
- `npx expo export --platform ios --output-dir /tmp/hl-export`: exit 0; one iOS bundle, `entry-*.hbc` 4.4 MB (4.3 MB directory).
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green (`check.sh`).
