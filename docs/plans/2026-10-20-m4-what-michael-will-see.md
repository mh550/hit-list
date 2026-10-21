# M4: what Michael will see (photo viewer)

Rendered from scratch in Jest (temporary tests, deleted before commit; trees trimmed to the props a user or VoiceOver meets).

## Detail grid tile that opens the viewer

7-photo spot, tile index 2:

```
testID photo-tile-2 · role imagebutton · label "Photo 3 of 7"
press → router.push("/spot/<id>/photos?index=2")
```
Tiles are labelled "Photo 1 of 7" … "Photo 7 of 7" (primary first).

## Viewer, 7 photos opened at index 2

```
View testID="photo-viewer"                      (black root)
  ScrollView horizontal pagingEnabled scrollEnabled=true initialScrollIndex=2
    page: View label="Photo 3 of 7" role=image hint="Double-tap and hold for options"
          actions=[longpress "Photo options"]  → Image file:///…/photos/<spot>/<n>.jpg
  Text "3 / 7"
  Button label="Close" (✕ icon)
```

After a simulated swipe settling on page 6 (`momentumScrollEnd`, offset 5 × width): the counter reads **"6 / 7"**, and the Close button is unchanged.
Note: in Jest only the pages around the initial index are mounted, so the page label after the swipe still shows the page-3 view; a real list mounts the shown page.

## Try on the phone

None of these gestures ran on a device in this run; Jest cannot drive real pinches (gestures were fired through gesture-handler's test utils only).

- [ ] Swipe left/right between photos → pages snap, counter "N / 7" follows.
- [ ] Pinch out → grows smoothly and stops at 4×; pinch in → returns to 1× (no shrink below).
- [ ] Double-tap → zooms to 2.5×; double-tap again → back to 1×.
- [ ] While zoomed (>1.05×), horizontal swipe pans the photo and does NOT change page; at 1× paging works again.
- [ ] At 1×, drag down more than ~120 px → photo follows the finger and the viewer closes; a shorter drag springs back. While zoomed, dragging down does NOT close.
- [ ] ✕ → closes to the spot detail. Edge swipe / Android back also closes.
- [ ] Long-press (~0.5 s) a photo → alert "Set as primary / Remove photo (red) / Cancel". A double-tap never opens it; a pinch after a still two-finger hold shouldn't either.
- [ ] Set as primary → the same photo stays shown; the detail grid's first tile changes afterwards.
- [ ] Remove photo → "Remove this photo?" → confirm → counter drops by one (7 → "N / 6") and the neighbour shows; removing the last photo closes the viewer.
- [ ] VoiceOver: double-tap and hold (or the Actions rotor "Photo options") opens the options.

## Verification numbers

- `npx jest --silent`: 46 suites, **520 tests** passed.
- `npx expo export --platform ios --output-dir /tmp/harness/hit_list/hit_list-2026-10-20/export`: exit **0**, Hermes bundle **4,240,251 B**.
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green via `check.sh`.
