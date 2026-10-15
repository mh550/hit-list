# S2 — Sort + search on the Spots tab — Implementation Plan

> **For agentic workers:** RED tests by a Sonnet subagent, implementation by an Opus subagent (Michael, 2026-10-15); gates re-run by the loop.

**Goal (D10):** find a spot by name, and order the list by Distance / Date / Name / Intensity.

**Design decisions**
- **No `headerSearchBarOptions`.** The Spots screen lives in a bottom-tab navigator (`app/(tabs)/_layout.tsx`), whose header has no native search bar (that option belongs to native-stack screens). A plain search `TextInput` sits in the Spots screen under the List | Map toggle instead. It filters **both** views (it writes `filters.search_query`, which `selectFilteredSpots` already honours).
- **Search is not a "filter" in the badge.** With its own visible field, counting it in "Filter (n)" would be confusing: `selectActiveFilterCount` stops counting `search_query`, and the Filter sheet's Reset keeps the current search.
- **Sort chips, list view only** (the map has no order). Natural first direction per field: Date newest first, Name A to Z, Distance nearest first, Intensity highest first. Tapping the active chip flips it; the active chip shows ↓ or ↑. Distance is disabled until a location is known; if the location goes away while sorting by Distance, the order falls back to the store's existing behaviour (stable, unchanged).
- **No-match state.** When spots exist but none match the search or filters, the list shows "No matching spots" (with a way to clear the search), not "No Spots Yet / Tap + to add your first spot".
- Store logic already exists (`setSort`, `selectSortedSpots`, `search_query`); `setSort(field, direction)` is called with an explicit direction for the natural default.

### Task 1: Search
- [ ] RED: typing "pier" shows only matching names (list) and only their markers (map); clearing restores all; Filter badge unchanged while searching; Reset in the Filter sheet keeps the search; no-match state text.
- [ ] GREEN, gates.

### Task 2: Sort
- [ ] RED: four chips in list mode, none in map mode; default Date ↓ (newest first); tapping Name orders A to Z, again Z to A; Distance chip disabled with no location, enabled and nearest first with one; Intensity highest first.
- [ ] GREEN, gates (jest 0 console.error, typecheck, lint, `npx expo export --platform ios`). Commit `feat: sort and search on the Spots tab (D10, S2)`.
