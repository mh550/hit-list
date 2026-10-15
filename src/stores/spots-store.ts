import { create } from 'zustand';
import type { Spot, SpotFilters, GeoPoint, SpotUpdate } from '@/src/types';
import { DEFAULT_FILTERS, SortField, SortDirection, SpotStatus } from '@/src/types';
import { haversineDistance, isKnownLocation } from '@/src/utils/geo';

export type ViewMode = 'list' | 'map';

interface SpotsState {
  spots: Spot[];
  viewMode: ViewMode;
  filters: SpotFilters;
  sortField: SortField;
  sortDirection: SortDirection;

  // Actions
  setSpots: (spots: Spot[]) => void;
  addSpot: (spot: Spot) => void;
  updateSpot: (id: string, updates: SpotUpdate) => void;
  removeSpot: (id: string) => void;
  setFilters: (filters: Partial<SpotFilters>) => void;
  resetFilters: () => void;
  setSort: (field: SortField, direction?: SortDirection) => void;
  setViewMode: (viewMode: ViewMode) => void;
}

/** Merges a patch into a spot; `name: null` (cleared in Edit) becomes no name, so it shows as untitled. */
function applySpotUpdate(spot: Spot, { name, ...rest }: SpotUpdate): Spot {
  const next: Spot = { ...spot, ...rest };
  if (name !== undefined) next.name = name ?? undefined;
  return next;
}

export const useSpotsStore = create<SpotsState>((set) => ({
  spots: [],
  viewMode: 'list',
  filters: { ...DEFAULT_FILTERS },
  sortField: SortField.DateAdded,
  sortDirection: SortDirection.Desc,

  setSpots: (spots) => set({ spots }),

  addSpot: (spot) =>
    set((state) => ({ spots: [...state.spots, spot] })),

  updateSpot: (id, updates) =>
    set((state) => ({
      spots: state.spots.map((s) => (s.id === id ? applySpotUpdate(s, updates) : s)),
    })),

  removeSpot: (id) =>
    set((state) => ({
      spots: state.spots.filter((s) => s.id !== id),
    })),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  setViewMode: (viewMode) => set({ viewMode }),

  setSort: (field, direction) =>
    set((state) => ({
      sortField: field,
      sortDirection: direction ?? (
        state.sortField === field && state.sortDirection === SortDirection.Asc
          ? SortDirection.Desc
          : SortDirection.Asc
      ),
    })),
}));

// ── Selectors ───────────────────────────────────────────

export function selectFilteredSpots(
  spots: Spot[],
  filters: SpotFilters,
): Spot[] {
  const query = filters.search_query.trim().toLowerCase();
  return spots.filter((spot) => {
    // Status filter
    if (!filters.show_drafts && spot.status === SpotStatus.Draft) return false;

    // Search: the user's name or the town. Not the generated "Untitled · <Town> · <date>" label,
    // whose "untitled", month and AM/PM would match every unnamed spot.
    if (query && !matchesSearch(spot, query)) return false;

    // Type filter (OR)
    if (filters.types.length > 0) {
      if (!spot.feature.type || !filters.types.includes(spot.feature.type)) return false;
    }

    // Natural speed range
    if (filters.natural_speed_min != null && spot.in_run.natural_speed != null) {
      if (spot.in_run.natural_speed < filters.natural_speed_min) return false;
    }
    if (filters.natural_speed_max != null && spot.in_run.natural_speed != null) {
      if (spot.in_run.natural_speed > filters.natural_speed_max) return false;
    }

    // Bustability range
    if (filters.bustability_min != null && spot.metadata.bustability != null) {
      if (spot.metadata.bustability < filters.bustability_min) return false;
    }
    if (filters.bustability_max != null && spot.metadata.bustability != null) {
      if (spot.metadata.bustability > filters.bustability_max) return false;
    }

    // Intensity range
    if (filters.intensity_min != null && spot.metadata.intensity != null) {
      if (spot.metadata.intensity < filters.intensity_min) return false;
    }
    if (filters.intensity_max != null && spot.metadata.intensity != null) {
      if (spot.metadata.intensity > filters.intensity_max) return false;
    }

    // Gear + Build two-stage filter
    if (filters.gear.length > 0 || filters.exclude_build.length > 0) {
      const setupOptions = spot.in_run.setup_options;
      if (setupOptions.length === 0) return true; // no requirements = matches all

      const matchingOptions = setupOptions.filter((option) => {
        // Stage 1: gear superset check
        if (filters.gear.length > 0) {
          const gearRequired = option.requires
            .filter((r) => r.category === 'gear')
            .map((r) => r.item);
          // Empty gear requirements matches all users
          if (gearRequired.length > 0) {
            const hasAllGear = gearRequired.every((g) =>
              filters.gear.includes(g as typeof filters.gear[number]),
            );
            if (!hasAllGear) return false;
          }
        }

        // Stage 2: build exclusion check
        if (filters.exclude_build.length > 0) {
          const buildRequired = option.requires
            .filter((r) => r.category === 'build')
            .map((r) => r.item);
          const hasExcluded = buildRequired.some((b) =>
            filters.exclude_build.includes(b as typeof filters.exclude_build[number]),
          );
          if (hasExcluded) return false;
        }

        return true;
      });

      if (matchingOptions.length === 0) return false;
    }

    return true;
  });
}

/** Whether the spot's name or town contains `query` (already trimmed and lowercased). */
function matchesSearch(spot: Spot, query: string): boolean {
  return [spot.name, spot.generated_name].some((text) => text?.toLowerCase().includes(query));
}

/** A spot's value for the sort field, or `null` when it has none (no location, no intensity, no name). */
function sortKey(spot: Spot, field: SortField, userLocation?: GeoPoint): number | string | null {
  switch (field) {
    case SortField.Distance:
      return userLocation && isKnownLocation(spot.location) ? haversineDistance(userLocation, spot.location) : null;
    case SortField.Intensity:
      return spot.metadata.intensity ?? null;
    case SortField.Name:
      return spot.name || null;
    case SortField.DateAdded:
      return createdAt(spot);
  }
}

/** Ascending order of two keys of the same field: names case-insensitively, numbers by value. */
function compareKeys(a: number | string, b: number | string): number {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  }
  return Number(a) - Number(b);
}

function createdAt(spot: Spot): number {
  return new Date(spot.created_at).getTime();
}

/**
 * Sorts by one field. Spots without a value for it (no location, no intensity, no name) go last in
 * both directions; the direction applies only among spots that have one. Ties, and the whole
 * missing group, keep the default order: newest first, whatever the direction.
 */
export function selectSortedSpots(
  spots: Spot[],
  sortField: SortField,
  sortDirection: SortDirection,
  userLocation?: GeoPoint,
): Spot[] {
  const sign = sortDirection === SortDirection.Asc ? 1 : -1;
  const keyed = spots.map((spot) => ({ spot, key: sortKey(spot, sortField, userLocation) }));

  keyed.sort((a, b) => {
    if (a.key === null || b.key === null) {
      // Missing values go last; within the missing group the default order (newest first) applies.
      if (a.key !== b.key) return a.key === null ? 1 : -1;
      return createdAt(b.spot) - createdAt(a.spot);
    }
    return sign * compareKeys(a.key, b.key) || createdAt(b.spot) - createdAt(a.spot);
  });

  return keyed.map(({ spot }) => spot);
}

/** Filters set in the Filter sheet. The search has its own field on the Spots tab, so it is not counted. */
export function selectActiveFilterCount(filters: SpotFilters): number {
  let count = 0;
  if (filters.types.length > 0) count++;
  if (filters.natural_speed_min != null || filters.natural_speed_max != null) count++;
  if (filters.gear.length > 0) count++;
  if (filters.exclude_build.length > 0) count++;
  if (filters.bustability_min != null || filters.bustability_max != null) count++;
  if (filters.intensity_min != null || filters.intensity_max != null) count++;
  if (!filters.show_drafts) count++;
  return count;
}
