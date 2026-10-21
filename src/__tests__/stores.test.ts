import {
  selectFilteredSpots,
  selectSortedSpots,
  selectActiveFilterCount,
} from '@/src/stores/spots-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useSpotsStore } from '@/src/stores';
import {
  DEFAULT_FILTERS,
  FeatureType,
  SortField,
  SortDirection,
  UnitSystem,
} from '@/src/types';
import type { SpotFilters } from '@/src/types';
import { NO_LOCATION } from '@/src/utils/geo';
import { CITIES, createTestSpot } from './factories';

describe('selectFilteredSpots', () => {
  const railSpot = createTestSpot({
    id: 'rail-spot',
    name: 'Rail Spot',
    feature_types: [FeatureType.Rail],
    stopped: true,
  });

  const ledgeSpot = createTestSpot({
    id: 'ledge-spot',
    name: 'Ledge Spot',
    feature_types: [FeatureType.Ledge],
  });

  const untaggedSpot = createTestSpot({ id: 'untagged-spot', name: 'Untagged Spot' });

  const allSpots = [railSpot, ledgeSpot, untaggedSpot];

  it('returns all spots with default filters', () => {
    const result = selectFilteredSpots(allSpots, DEFAULT_FILTERS);
    expect(result).toHaveLength(3);
  });

  it('filters by type', () => {
    const filters: SpotFilters = { ...DEFAULT_FILTERS, types: [FeatureType.Rail] };
    const result = selectFilteredSpots(allSpots, filters);
    expect(result.map((s) => s.id)).toEqual(['rail-spot']);
  });

  it('types is any-of against feature_types', () => {
    const both = createTestSpot({ id: 'both', feature_types: [FeatureType.Ledge, FeatureType.Rail] });
    const bank = createTestSpot({ id: 'bank', feature_types: [FeatureType.Bank] });
    const result = selectFilteredSpots([both, bank], { ...DEFAULT_FILTERS, types: [FeatureType.Rail] });
    expect(result.map((s) => s.id)).toEqual(['both']);
  });

  describe('natural speed range (0–4)', () => {
    const none = createTestSpot({ id: 'none', natural_speed: 0 });
    const some = createTestSpot({ id: 'some', natural_speed: 2 });
    const fast = createTestSpot({ id: 'fast', natural_speed: 4 });
    const unrated = createTestSpot({ id: 'unrated' });
    const speedSpots = [none, some, fast, unrated];
    const ids = (filters: SpotFilters) => selectFilteredSpots(speedSpots, filters).map((s) => s.id);

    it('keeps spots inside the range and unrated spots', () => {
      expect(ids({ ...DEFAULT_FILTERS, natural_speed_min: 1, natural_speed_max: 3 })).toEqual(['some', 'unrated']);
    });

    it('treats 0 as a real value at both ends', () => {
      expect(ids({ ...DEFAULT_FILTERS, natural_speed_max: 0 })).toEqual(['none', 'unrated']);
      expect(ids({ ...DEFAULT_FILTERS, natural_speed_min: 0 })).toEqual(['none', 'some', 'fast', 'unrated']);
    });

    it('min 4 keeps only the fastest and unrated', () => {
      expect(ids({ ...DEFAULT_FILTERS, natural_speed_min: 4 })).toEqual(['fast', 'unrated']);
    });
  });

  it('stopped: true keeps only stopped spots', () => {
    const result = selectFilteredSpots(allSpots, { ...DEFAULT_FILTERS, stopped: true });
    expect(result.map((s) => s.id)).toEqual(['rail-spot']);
  });

  it('stopped: false keeps only spots that are not stopped', () => {
    const result = selectFilteredSpots(allSpots, { ...DEFAULT_FILTERS, stopped: false });
    expect(result.map((s) => s.id)).toEqual(['ledge-spot', 'untagged-spot']);
  });

  it('filters by search query (case insensitive)', () => {
    const result = selectFilteredSpots(allSpots, DEFAULT_FILTERS, 'LEDGE');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ledge-spot');
  });
});

describe('selectSortedSpots', () => {
  const spotA = createTestSpot({
    name: 'Alpha',
    created_at: '2025-01-01T00:00:00Z',
    location: CITIES.seattle,
  });

  const spotB = createTestSpot({
    name: 'Beta',
    created_at: '2025-02-01T00:00:00Z',
    location: CITIES.portland,
  });

  it('sorts by name ascending', () => {
    const result = selectSortedSpots([spotB, spotA], SortField.Name, SortDirection.Asc);
    expect(result[0].name).toBe('Alpha');
  });

  it('sorts by name descending', () => {
    const result = selectSortedSpots([spotA, spotB], SortField.Name, SortDirection.Desc);
    expect(result[0].name).toBe('Beta');
  });

  it('sorts by date ascending', () => {
    const result = selectSortedSpots([spotB, spotA], SortField.DateAdded, SortDirection.Asc);
    expect(result[0].name).toBe('Alpha');
  });

  it('sorts by distance from user location', () => {
    const result = selectSortedSpots(
      [spotB, spotA],
      SortField.Distance,
      SortDirection.Asc,
      CITIES.seattle,
    );
    expect(result[0].name).toBe('Alpha'); // closer to Seattle
  });
});

describe('selectSortedSpots: missing data sorts last in both directions', () => {
  const seattleSpot = createTestSpot({ name: 'seattle', location: { latitude: 47.61, longitude: -122.33 }, created_at: '2025-01-01T00:00:00Z' });
  const portlandSpot = createTestSpot({ name: 'portland', location: CITIES.portland, created_at: '2025-01-02T00:00:00Z' });
  const nowhereOld = createTestSpot({ name: 'nowhere-old', location: NO_LOCATION, created_at: '2025-01-03T00:00:00Z' });
  const nowhereNew = createTestSpot({ name: 'nowhere-new', location: NO_LOCATION, created_at: '2025-01-04T00:00:00Z' });
  const names = (list: { name?: string }[]) => list.map((s) => s.name);

  it('Distance ascending: located spots nearest first, then spots with no location', () => {
    // (0, 0) is "unknown", not a real place off Africa; it would otherwise sort as very far or very near.
    // The user stands near (0, 0) so a naive haversine to the stored (0, 0) would rank the unknown spot nearest.
    const nullIsland = { latitude: 0.5, longitude: 0.5 };
    const result = selectSortedSpots([nowhereOld, portlandSpot, seattleSpot], SortField.Distance, SortDirection.Asc, nullIsland);

    // From (0.5, 0.5) Seattle is ~12,348 km away and Portland ~12,472 km.
    expect(names(result)).toEqual(['seattle', 'portland', 'nowhere-old']);
  });

  it('Distance descending: located spots farthest first, and no-location spots still last', () => {
    // Flipping the direction must not bring the unknowns to the top.
    const result = selectSortedSpots([nowhereOld, seattleSpot, portlandSpot], SortField.Distance, SortDirection.Desc, CITIES.seattle);

    expect(names(result)).toEqual(['portland', 'seattle', 'nowhere-old']);
  });

  it('Distance: spots with no location break ties by created_at newest first (both directions)', () => {
    // The missing group is ordered deterministically.
    for (const direction of [SortDirection.Asc, SortDirection.Desc]) {
      const result = selectSortedSpots([nowhereOld, nowhereNew, seattleSpot], SortField.Distance, direction, CITIES.seattle);

      expect(names(result)).toEqual(['seattle', 'nowhere-new', 'nowhere-old']);
    }
  });

  const zulu = createTestSpot({ name: 'Zulu', created_at: '2025-01-05T00:00:00Z' });
  const alpha = createTestSpot({ name: 'Alpha', created_at: '2025-01-01T00:00:00Z' });
  const unnamedOld = createTestSpot({ generated_name: 'Aberdeen', created_at: '2025-01-03T00:00:00Z' });
  const unnamedNew = createTestSpot({ generated_name: 'Zillah', created_at: '2025-01-04T00:00:00Z' });

  it('Name ascending: A to Z, unnamed spots last', () => {
    // "Untitled ..." would otherwise sort among the U names, and unnamed ones are not worth a name slot.
    const result = selectSortedSpots([unnamedOld, zulu, alpha], SortField.Name, SortDirection.Asc);

    expect(result.map((s) => s.name)).toEqual(['Alpha', 'Zulu', undefined]);
  });

  it('Name descending: Z to A, unnamed spots still last', () => {
    // Flipping the direction must not bring the unnamed to the top.
    const result = selectSortedSpots([unnamedOld, alpha, zulu], SortField.Name, SortDirection.Desc);

    expect(result.map((s) => s.name)).toEqual(['Zulu', 'Alpha', undefined]);
  });

  it('Name: unnamed spots break ties by created_at newest first (both directions)', () => {
    // The unnamed group keeps the default date order, not its town or label order.
    for (const direction of [SortDirection.Asc, SortDirection.Desc]) {
      const result = selectSortedSpots([unnamedOld, unnamedNew, alpha], SortField.Name, direction);

      expect(result.map((s) => s.id)).toEqual([alpha.id, unnamedNew.id, unnamedOld.id]);
    }
  });
});

describe('selectActiveFilterCount', () => {
  it('returns 0 for default filters', () => {
    expect(selectActiveFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts type filter', () => {
    expect(
      selectActiveFilterCount({ ...DEFAULT_FILTERS, types: [FeatureType.Rail] }),
    ).toBe(1);
  });

  it('counts stopped: false as set (only undefined means any)', () => {
    expect(selectActiveFilterCount({ ...DEFAULT_FILTERS, stopped: false })).toBe(1);
  });

  it('counts types, stopped and the speed range: 3', () => {
    expect(
      selectActiveFilterCount({
        types: [FeatureType.Rail],
        stopped: true,
        natural_speed_min: 1,
        natural_speed_max: 3,
      }),
    ).toBe(3);
  });
});

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
    });
  });

  it('toggles units', () => {
    useSettingsStore.getState().setUnits(UnitSystem.Metric);
    expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);
  });
});

describe('useSpotsStore.updateSpot: primary_photo_id', () => {
  afterEach(() => useSpotsStore.setState({ spots: [] }));

  it('null clears primary_photo_id (undefined in memory) while other fields stay', () => {
    // Removing the last photo must leave the spot without a primary; null is the patch value that clears it.
    const spot = createTestSpot({ id: 'p1', name: 'Keep me', primary_photo_id: 'photo-1' });
    useSpotsStore.setState({ spots: [spot] });

    useSpotsStore.getState().updateSpot('p1', { primary_photo_id: null });

    const updated = useSpotsStore.getState().spots[0];
    expect(updated.primary_photo_id).toBeUndefined();
    expect(updated.name).toBe('Keep me');
  });
});

describe('useSpotsStore.updateSpot: notes and natural_speed', () => {
  afterEach(() => useSpotsStore.setState({ spots: [] }));

  it('null clears notes and natural_speed (undefined in memory) while other fields stay', () => {
    const spot = createTestSpot({ id: 'n1', name: 'Keep me', notes: 'hello', natural_speed: 3 });
    useSpotsStore.setState({ spots: [spot] });

    useSpotsStore.getState().updateSpot('n1', { notes: null, natural_speed: null });

    const updated = useSpotsStore.getState().spots[0];
    expect(updated.notes).toBeUndefined();
    expect(updated.natural_speed).toBeUndefined();
    expect(updated).not.toHaveProperty('notes', null);
    expect(updated).not.toHaveProperty('natural_speed', null);
    expect(updated.name).toBe('Keep me');
  });

  it('natural_speed 0 is kept, not treated as a clear', () => {
    const spot = createTestSpot({ id: 'n2', natural_speed: 3 });
    useSpotsStore.setState({ spots: [spot] });

    useSpotsStore.getState().updateSpot('n2', { natural_speed: 0 });

    expect(useSpotsStore.getState().spots[0].natural_speed).toBe(0);
  });

  it('an undefined key in the patch keeps the stored value, as updateSpot in the DB does', () => {
    const spot = createTestSpot({ id: 'u1', feature_types: [FeatureType.Rail], stopped: true });
    useSpotsStore.setState({ spots: [spot] });

    useSpotsStore.getState().updateSpot('u1', { feature_types: undefined, stopped: undefined, updated_at: 'x' });

    expect(useSpotsStore.getState().spots[0]).toMatchObject({ feature_types: [FeatureType.Rail], stopped: true });
  });
});
