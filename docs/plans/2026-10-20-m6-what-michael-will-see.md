# M6: what Michael will see

Rendered from scratch with a temporary Jest test (deleted before commit) that walks the real
`app/add/review.tsx` and `app/import/review.tsx` and lists, in render order, every text, input
placeholder and button/switch/radio label. Imperial units, radius 50 m, Seattle. Photo thumbnails
are images, so they don't appear as text.

## Quick Add review

### 1. Two photos, no nearby spot (the fast path)
1. 'Spot Name (optional)' · input 'e.g. Downtown Rail, Bridge Ledge...' · 'Leave blank to auto-name from location'
2. Link 'Add details'
3. 'Location captured' · '47.6062, -122.3321'
4. Button 'Save' (label 'Save spot')

Name and Save only; no tags until asked.

### 2. Same, 'Add details' open
Name block as above, then (the link is gone, no 'Hide'):
1. 'What's here' chips: Rail · Ledge · Bank · Hip · Stair set · Gap · Wall ride · Quarter pipe
2. 'Skate stopped' with a switch
3. 'Natural speed' radios: None · Little · Some · Enough · Too much, then 'Not rated'
4. 'Location captured' · coordinates, then 'Save'

### 3. Three nearby spots (5 m, 20 m, 45 m)
Name block and 'Add details' link, location, then the card:
1. 'Already have this spot?'
2. 'Near Five Rail · 16 ft' · button 'Add photos there' (label 'Add photos there, Five Rail'; M6-06)
3. 'Near Twenty Ledge · 66 ft' · 'Add photos there' (label 'Add photos there, Twenty Ledge'; M6-06)
4. 'Near Forty Five Bank · 148 ft' · 'Add photos there' (label 'Add photos there, Forty Five Bank'; M6-06)
5. 'Save'

Nearest first. A spot 80 m away is not offered. Pressing 'Add photos there' saves to that spot
and opens it; Save still makes a new spot.

## Import review (two groups: A has 2 photos on Oct 1, B has 1 on Oct 2, 5 km away)

### 4. Before choosing (A is 15 m from the existing 'Library Rail')
1. Subtitle '2 spots from your photos. Name each spot or leave blank for auto-naming.'
2. Group A: '2 photos · Oct 1' · 'Near Library Rail · 49 ft' · choice 'New spot' (selected) / 'Add photos to Library Rail' · input 'Spot name (optional)' · 'Remove'
3. Group B: '1 photo · Oct 2' · input 'Spot name (optional)' · 'Remove' (no offer)
4. Button 'Import 2 Spots'

### 5. After choosing 'Add photos to Library Rail'
1. Subtitle '1 spot from your photos. …'
2. Group A: same header and 'Near' line, 'Add photos to Library Rail' selected, **name input gone** (D30)
3. Group B unchanged
4. Button 'Import 1 Spot' (only new spots count)

## Verification recorded
- `npx jest --silent`: 51 suites, 626 tests passed.
- `npx expo export --platform ios --output-dir /tmp/hl-export`: exit 0.
- `npx expo lint && npx tsc --noEmit && npx jest --silent`: green via `check.sh`.
