# S1: what Michael will see (Lists tab, list screen, In lists row, select mode, list picker)

Rendered from scratch in Jest (a temporary test, deleted before commit) with two lists, Downtown (Pier rail, Library ledge) and Bridges (Pier rail), and a third spot, Church bank, in neither. Trees trimmed to text, roles, labels, hints and states, in rendered order. Tabs are now Spots · Lists · Profile.

## 1. Lists tab (two lists)

```
[button label="New hit list"]  (+ icon)  "New hit list"
[header] "My hit lists"
[button label="Bridges, 1 spot"]    "Bridges"   "1 spot"    (chevron)
[button label="Downtown, 2 spots"]  "Downtown"  "2 spots"   (chevron)
```
Name order. With no lists: 'No hit lists yet' / 'Group spots you mean to hit: by hand, or by area'.

## 2. List screen (Downtown, two spots)

Header: title `Downtown`; right: 'Rename' (label "Rename list"), 'Filter' (label "Filter spots").
```
[tablist] [tab selected] "List"   [tab] "Map"
[search label="Search spots"] placeholder "Search spots"
[button label="Sort by Distance" hint="Needs your location" disabled] "Distance"
[button label="Sort by Date"] "Date"
[button label="Sort by Name, A to Z" hint="Double-tap to reverse" selected] "Name ↑"
[button label="Library ledge, Ledge"]  "No Photo"  "Library ledge"  "Ledge"
[button label="Pier rail, Rail"]       "No Photo"  "Pier rail"     "Rail"
[button label="Delete list"] "Delete list"      (bottom bar)
```
Long press a row: Alert with 'Remove from list' / Cancel. Delete asks 'Delete Downtown?' / 'Spots stay in your library.'

## 3. Spot detail, 'In lists' row (Pier rail in one list)

```
[button label="Add photos"]  (+ icon)
"Pier rail"
"Rail"
"In lists"
[button] "Downtown"                                  (opens the list)
[button label="Add to hit list"] "+ Add to hit list"
```
The row sits under the tag line, above the speed bar. A spot in no list shows 'In lists' and the add chip only.

## 4. Spots tab, select mode, two selected

Header: headerTitle `2 selected`; left: 'Cancel' (label "Cancel selection"); right: 'Filter' (label "Filter spots"). The tab label stays 'Spots'.
```
[tablist] [tab] "My spots" (selected)  "Bridges"  "Downtown"
[tablist] [tab selected] "List"   [tab] "Map"
[search label="Search spots"]
sort chips: Distance (disabled) · Date · Name ↑
[checkbox label="Church bank"          checked=false]  "No Photo"  "Church bank"
[checkbox label="Library ledge, Ledge" checked=true]   (check icon)  "No Photo"  "Library ledge"  "Ledge"
[checkbox label="Pier rail, Rail"      checked=true]   (check icon)  "No Photo"  "Pier rail"     "Rail"
[select-bar] [button label="Add to list (2)"] "Add to list (2)"
```
No Import / Add FABs while selecting. A tap toggles a row and never opens the spot. Outside select mode the header's left shows 'Select' (label "Select spots").

## 5. List picker row (above List | Map)

```
[tablist] [tab selected] "My spots"   [tab] "Bridges"   [tab] "Downtown"
```
'My spots' first, then lists by name; each chip has role tab with `selected` state. With no lists the row isn't rendered. Picking a list scopes List and Map; an empty list says 'No spots in this list yet'.

## What to tap

1. Lists tab → '+ New hit list' → type 'Downtown' → Create. It appears with '0 spots'.
2. Open Downtown → open a spot from the Spots tab → under the tags tap '+ Add to hit list' → tick Downtown → Done. Back on Lists it says '1 spot'.
3. Spots tab → long press a spot (or 'Select') → tap a second one → '2 selected' → 'Add to list (2)' → tick Downtown → Done → Cancel.
4. Pick 'Downtown' in the picker row; switch List ↔ Map; both show only its spots.
5. Lists tab → Downtown → 'Rename' → new name → Save.
6. 'Delete list' → confirm. Go to the Spots tab: every spot is still there, the picker row is gone or back on 'My spots'.

## Known limits

- No area lists yet (S2); the Lists tab has no area section.
- No sharing yet; no accounts, nothing leaves the phone.
- Lists are local to this phone (SQLite, migration 4); reinstalling the app loses them.
- 'Add from a spot's page or select spots on the Spots tab' (empty-list hint) is shown on the Spots tab itself, where the second half is already true.

## Commands run

| Command | Result |
|---|---|
| `npx jest --silent` | 64 suites, 807 tests passed; `npx jest --ci` shows 0 `console.error` lines |
| `npx expo export --platform ios --output-dir /tmp/hl-export` | exit 0; one bundle, `entry-….hbc` 4.3 MB (4,328,700 bytes) |
| `npx expo lint && npx tsc --noEmit && npx jest --silent` (`check.sh`) | green |
