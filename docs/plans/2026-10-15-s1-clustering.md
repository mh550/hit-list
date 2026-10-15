# S1 — Pin clustering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, per `OVERNIGHT.md`).

**Goal:** Several spots at one place (D8) read as one numbered cluster when zoomed out; tapping it
zooms in, and at the closest zoom the pins fan out so each can be tapped.

**Architecture:** `react-native-map-clustering` 4.0.0 (pure JS over `react-native-maps`, peers `*`,
uses `supercluster`) replaces the bare `MapView` inside `SpotMap`; the markers stay as they are (it
clusters any child with a `coordinate`). No other file changes behaviour.

**Spec:** `docs/specs/2026-10-13-overnight-design.md` D8, §2.1 "S"; runbook `OVERNIGHT.md` stretch S1.

## Global Constraints
- Install only with `npx expo install react-native-map-clustering` → its own `chore:` commit; if npm
  rejects a peer, stop and record it (never override peers). Peer check done: `react-native-maps: *`.
- Jest must transform `supercluster` and `kdbush` (ES-module packages): add them to
  `transformIgnorePatterns`. `__mocks__/react-native-maps.tsx` gains a `forwardRef` MapView exposing
  `fitToCoordinates` / `animateToRegion` (`MapView.d.ts` method names) because the wrapper calls
  `mapRef.current.fitToCoordinates` on a cluster press.
- Region limits and (0, 0) filtering from M5 stay as they are.

## Review Focus
1. 5 spots within 30 m at the opening zoom → exactly one cluster showing "5", no individual pins.
2. Spots far apart → no clustering; every spot keeps its own pin, colour and callout.
3. Tapping a cluster → the map zooms to those spots (`fitToCoordinates` with their coordinates).
4. Cluster colour comes from the theme, readable on Apple Maps.

### Task 1: Clustered SpotMap
- [ ] `npx expo install react-native-map-clustering` → `chore: add react-native-map-clustering`.
- [ ] RED (`spot-map.test.tsx`): five spots ~5–30 m apart render one marker whose text is `5` and no
  `spot-marker-*`; a far-apart pair renders two `spot-marker-*`; pressing the cluster marker calls the
  mock's `fitToCoordinates` with five coordinates.
- [ ] GREEN: `SpotMap` imports `MapView` from `react-native-map-clustering`; `clusterColor =
  colors.light.primary`, `clusterTextColor = palette.white`; mock + `transformIgnorePatterns` as above.
- [ ] Gates: jest (0 `console.error`), typecheck, lint, `npx expo export --platform ios`. Commit
  `feat: cluster pins of spots at one place (D8, S1)`.
