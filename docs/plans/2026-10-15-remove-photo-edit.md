# Stretch — Remove a photo in Edit — Implementation Plan

> RED tests by a Sonnet subagent, implementation by an Opus subagent; gates re-run by the loop.

**Goal:** take a wrong or duplicate photo off a spot from the Edit screen. D3: only the media **row** goes; the file in
`Paths.document/photos/<spotId>/` stays (nothing deletes photo files tonight; the camera roll is never touched).

**Design**
- Edit gets a "Photos" section (above Name) with the spot's photos as thumbnails (primary first, same order as the detail gallery,
  `spotPhotos`). Each has a small remove control (accessibilityLabel "Remove photo 1", "Remove photo 2", …). Tapping it hides the
  photo in the form and stages the removal; there is no confirm dialog because nothing happens until **Save** (Cancel/back undoes,
  like every other field on this screen). No photos → the section is not shown.
- Save: for each staged id, delete the row (DB first), then drop it from the media store; only rows whose delete succeeded leave the
  store. If the spot's `primary_photo_id` was removed, it becomes the first remaining photo's id, or is cleared (`null`) when none
  remain. Then the existing spot update runs.
- Plumbing: `useMediaActions().removePhotos(ids)`; media store `removeMany(ids)`; `SpotUpdate.primary_photo_id` accepts `null` (the DB
  layer already writes `?? null`; the store merge turns `null` into no primary, like `name`).

### Task 1
- [ ] RED: section hidden with no photos; thumbnails + remove labels; staging hides a photo; Save deletes rows and updates the store;
  Cancel path deletes nothing; primary reassigned / cleared; a failed delete keeps the photo; `removeMany` and real-SQLite delete.
- [ ] GREEN, gates. Commit `feat: remove a photo from a spot in Edit`.
