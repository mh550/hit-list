import { create } from 'zustand';
import type { Spot, SpotFilters, GeoPoint, SpotUpdate } from '@/src/types';
import { DEFAULT_FILTERS, SortField, SortDirection, SpotStatus } from '@/src/types';
import { haversineDistance, isKnownLocation } from '@/src/utils/geo';

export type ViewMode = 'list' | 'map';

interface SpotsState {
  spots: Spot[];
  viewMode: ViewMode;
  filters: SpotFilters;
  /** The Spots tab's search field. Kept apart from `filters`: the Filter sheet neither shows nor resets it. */
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
  /** Whether the user tapped a sort chip. Until then the list may open by Distance (see selectEffectiveSort). */
  sortChosen: boolean;

  // Actions
  setSpots: (spots: Spot[]) => void;
  addSpot: (spot: Spot) => void;
  updateSpot: (id: string, updates: SpotUpdate) => void;
  removeSpot: (id: string) => void;
  setFilters: (filters: Partial<SpotFilters>) => void;
  resetFilters: () => void;
  setSearchQuery: (searchQuery: string) => void;
  setSort: (sortField: SortField, sortDirection: SortDirection) => void;
  setViewMode: (viewMode: ViewMode) => void;
}

/**
 * Merges a patch into a spot; `name: null` (cleared in Edit) becomes no name, so it shows as untitled,
 * `notes: null` / `natural_speed: null` become unset, and `primary_photo_id: null` (last photo removed) becomes no primary.
 */
function applySpotUpdate(
  spot: Spot,
  { name, notes, natural_speed, primary_photo_id, ...rest }: SpotUpdate,
): Spot {
  const next: Spot = { ...spot, ...rest };
  if (name !== undefined) next.name = name ?? undefined;
  if (notes !== undefined) next.notes = notes ?? undefined;
  if (natural_speed !== undefined) next.natural_speed = natural_speed ?? undefined; // 0 is kept
  if (primary_photo_id !== undefined) next.primary_photo_id = primary_photo_id ?? undefined;
  return next;
}

export const useSpotsStore = create<SpotsState>((set) => ({
  spots: [],
  viewMode: 'list',
  filters: { ...DEFAULT_FILTERS },
  searchQuery: '',
  sortField: SortField.DateAdded,
  sortDirection: SortDirection.Desc,
  sortChosen: false,

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

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setViewMode: (viewMode) => set({ viewMode }),

  setSort: (sortField, sortDirection) => set({ sortField, sortDirection, sortChosen: true }),
}));

// ── Selectors ───────────────────────────────────────────

/** The spots the filters and the search (`searchQuery`, trimmed, case-insensitive) let through. */
export function selectFilteredSpots(
  spots: Spot[],
  filters: SpotFilters,
  searchQuery = '',
): Spot[] {
  const query = searchQuery.trim().toLowerCase();
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

/**
 * A spot's value for the sort field, or `null` when it has none (no location, no intensity, no name).
 * Names come back lowercased, so they compare case-insensitively.
 */
function sortKey(spot: Spot, field: SortField, userLocation?: GeoPoint): number | string | null {
  switch (field) {
    case SortField.Distance:
      return userLocation && isKnownLocation(spot.location) ? haversineDistance(userLocation, spot.location) : null;
    case SortField.Intensity:
      return spot.metadata.intensity ?? null;
    case SortField.Name:
      return spot.name ? spot.name.toLowerCase() : null;
    case SortField.DateAdded:
      return createdAt(spot);
  }
}

// The default locale's collation, as `String.prototype.localeCompare` with no arguments uses.
const nameCollator = new Intl.Collator();

/** Ascending order of two keys of the same field: names (already lowercased) by collation, numbers by value. */
function compareKeys(a: number | string, b: number | string): number {
  return typeof a === 'string' && typeof b === 'string' ? nameCollator.compare(a, b) : Number(a) - Number(b);
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
  const keyed = spots.map((spot) => ({ spot, key: sortKey(spot, sortField, userLocation), t: createdAt(spot) }));

  keyed.sort((a, b) => {
    // Missing values go last; within the missing group the default order (newest first) applies.
    if (a.key === null || b.key === null) return a.key === b.key ? b.t - a.t : a.key === null ? 1 : -1;
    return sign * compareKeys(a.key, b.key) || b.t - a.t;
  });

  return keyed.map(({ spot }) => spot);
}

/**
 * The sort the list uses. Until the user taps a chip, it is Distance, nearest first, whenever their position is
 * known (D14), and the stored default (Date, newest first) before a fix arrives. A chosen sort is kept as is.
 */
export function selectEffectiveSort(
  { sortField, sortDirection, sortChosen }: Pick<SpotsState, 'sortField' | 'sortDirection' | 'sortChosen'>,
  hasLocation: boolean,
): { sortField: SortField; sortDirection: SortDirection } {
  if (!sortChosen && hasLocation) return { sortField: SortField.Distance, sortDirection: SortDirection.Asc };
  return { sortField, sortDirection };
}

/** How many filters are set in the Filter sheet (the Filter button's badge). */
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
