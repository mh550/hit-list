# Stretch — Skate-stop fields in Edit — Implementation Plan

> RED tests by a Sonnet subagent, implementation by an Opus subagent; gates re-run by the loop.

**Goal:** edit a spot's skate stops (product spec "Skate Stop Information": `is_stopped`, `stop_type` knobs/caps/brackets/welds/other,
`stop_description`, `removable`). The detail screen already shows them; nothing could set them.

**Found while planning:** `handleSave` in `app/spot/[id]/edit.tsx` rebuilds `feature` without `skate_stops`, so saving any edit would wipe
skate-stop data a spot already has. The new fields fix that as a side effect; a test pins it.

**Design**
- Feature section, after Material: a "Skate stops" switch. On: "Stop type" chips (Knobs, Caps, Brackets, Welds, Other; tap again to
  clear), a "Stop details" text field (placeholder "Knobbed at kinks"), and a "Removable with tools" switch.
- Save: switch on → `skate_stops: { is_stopped: true, stop_type?, stop_description? (trimmed, empty → omitted), removable }`;
  switch off → `skate_stops: undefined` (a spot nobody marked stays "unknown"; the detail screen shows nothing either way).
- Toggling off and on again within one edit keeps what was typed (state stays in memory; only Save drops it).

### Task 1
- [x] RED: fields hidden when off, shown when on; save payload for on (all fields) and off; existing skate-stop data pre-filled and
  preserved through an unrelated edit; toggle off/on keeps typed values.
- [x] GREEN, gates. Commit `feat: edit a spot's skate stops`.
