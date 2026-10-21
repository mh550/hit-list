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
  GearItem,
  BuildItem,
  SortField,
  SortDirection,
  SpotStatus,
  UnitSystem,
} from '@/src/types';
import type { SpotFilters } from '@/src/types';
import { NO_LOCATION } from '@/src/utils/geo';
import { CITIES, createTestSpot } from './factories';

describe('selectFilteredSpots', () => {
  const spotWithWinch = createTestSpot({
    id: 'winch-spot',
    name: 'Winch Spot',
    feature: { type: FeatureType.Rail, difficulty: 3 },
    in_run: {
      natural_speed: 2,
      setup_options: [
        { requires: [{ item: GearItem.Winch, category: 'gear' }] },
      ],
    },
    metadata: { intensity: 4, bustability: 2 },
    status: SpotStatus.Complete,
  });

  const spotWithPlatform = createTestSpot({
    id: 'platform-spot',
    name: 'Platform Spot',
    feature: { type: FeatureType.Ledge },
    in_run: {
      setup_options: [
        {
          requires: [
            { item: GearItem.DropInPlatform, category: 'gear' },
            { item: BuildItem.SpeedHumps, category: 'build', quantity: 3 },
          ],
        },
      ],
    },
    status: SpotStatus.Complete,
  });

  const spotWithMultipleOptions = createTestSpot({
    id: 'multi-spot',
    name: 'Multi Option Spot',
    feature: { type: FeatureType.Rail },
    in_run: {
      setup_options: [
        { requires: [{ item: GearItem.Winch, category: 'gear' }] },
        {
          requires: [
            { item: GearItem.DropInPlatform, category: 'gear' },
            { item: BuildItem.SpeedHumps, category: 'build', quantity: 3 },
          ],
        },
      ],
    },
    status: SpotStatus.Complete,
  });

  const draftSpot = createTestSpot({
    id: 'draft-spot',
    name: 'Draft Spot',
    status: SpotStatus.Draft,
  });

  const allSpots = [spotWithWinch, spotWithPlatform, spotWithMultipleOptions, draftSpot];

  it('returns all spots with default filters', () => {
    const result = selectFilteredSpots(allSpots, DEFAULT_FILTERS);
    expect(result).toHaveLength(4);
  });

  it('filters by type', () => {
    const filters: SpotFilters = { ...DEFAULT_FILTERS, types: [FeatureType.Rail] };
    const result = selectFilteredSpots(allSpots, filters);
    expect(result.every((s) => s.feature.type === FeatureType.Rail)).toBe(true);
  });

  it('hides draft spots when show_drafts is false', () => {
    const filters: SpotFilters = { ...DEFAULT_FILTERS, show_drafts: false };
    const result = selectFilteredSpots(allSpots, filters);
    expect(result.every((s) => s.status === SpotStatus.Complete)).toBe(true);
  });

  it('filters by search query (case insensitive)', () => {
    const result = selectFilteredSpots(allSpots, DEFAULT_FILTERS, 'winch');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('winch-spot');
  });

  // Spec filter example table
  it('gear filter: winch matches winch-only setup', () => {
    const filters: SpotFilters = { ...DEFAULT_FILTERS, gear: [GearItem.Winch] };
    const result = selectFilteredSpots([spotWithWinch], filters);
    expect(result).toHaveLength(1);
  });

  it('gear filter: platform matches platform setup (build shown as info)', () => {
    const filters: SpotFilters = { ...DEFAULT_FILTERS, gear: [GearItem.DropInPlatform] };
    const result = selectFilteredSpots([spotWithPlatform], filters);
    expect(result).toHaveLength(1);
  });

  it('gear filter: platform + exclude speed_humps = no match', () => {
    const filters: SpotFilters = {
      ...DEFAULT_FILTERS,
      gear: [GearItem.DropInPlatform],
      exclude_build: [BuildItem.SpeedHumps],
    };
    const result = selectFilteredSpots([spotWithPlatform], filters);
    expect(result).toHaveLength(0);
  });

  it('gear filter: winch+platform + exclude speed_humps = match via winch option', () => {
    const filters: SpotFilters = {
      ...DEFAULT_FILTERS,
      gear: [GearItem.Winch, GearItem.DropInPlatform],
      exclude_build: [BuildItem.SpeedHumps],
    };
    const result = selectFilteredSpots([spotWithMultipleOptions], filters);
    expect(result).toHaveLength(1);
  });

  it('gear filter: bungee = no match when no setup uses bungee', () => {
    const filters: SpotFilters = { ...DEFAULT_FILTERS, gear: [GearItem.Bungee] };
    const result = selectFilteredSpots([spotWithWinch], filters);
    expect(result).toHaveLength(0);
  });

  it('spots with empty setup_options match any gear filter', () => {
    const noRequirements = createTestSpot({
      in_run: { setup_options: [] },
      status: SpotStatus.Complete,
    });
    const filters: SpotFilters = { ...DEFAULT_FILTERS, gear: [GearItem.Winch] };
    const result = selectFilteredSpots([noRequirements], filters);
    expect(result).toHaveLength(1);
  });
});

describe('selectSortedSpots', () => {
  const spotA = createTestSpot({
    name: 'Alpha',
    created_at: '2025-01-01T00:00:00Z',
    metadata: { intensity: 3 },
    location: CITIES.seattle,
  });

  const spotB = createTestSpot({
    name: 'Beta',
    created_at: '2025-02-01T00:00:00Z',
    metadata: { intensity: 5 },
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

  it('sorts by intensity descending', () => {
    const result = selectSortedSpots([spotA, spotB], SortField.Intensity, SortDirection.Desc);
    expect(result[0].name).toBe('Beta');
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

  const low = createTestSpot({ name: 'low', metadata: { intensity: 1 }, created_at: '2025-01-01T00:00:00Z' });
  const high = createTestSpot({ name: 'high', metadata: { intensity: 5 }, created_at: '2025-01-02T00:00:00Z' });
  const unratedOld = createTestSpot({ name: 'unrated-old', metadata: {}, created_at: '2025-01-03T00:00:00Z' });
  const unratedNew = createTestSpot({ name: 'unrated-new', metadata: {}, created_at: '2025-01-04T00:00:00Z' });

  it('Intensity descending: highest first, unrated last', () => {
    // An unrated spot is not intensity 0.
    const result = selectSortedSpots([unratedOld, low, high], SortField.Intensity, SortDirection.Desc);

    expect(names(result)).toEqual(['high', 'low', 'unrated-old']);
  });

  it('Intensity ascending: lowest first, unrated still last', () => {
    // Unrated is not counted as 0, which would float it to the top ascending.
    const result = selectSortedSpots([unratedOld, high, low], SortField.Intensity, SortDirection.Asc);

    expect(names(result)).toEqual(['low', 'high', 'unrated-old']);
  });

  it('Intensity: equal and unrated spots break ties by created_at newest first (both directions)', () => {
    // Deterministic order within the missing group, and between two spots rated 3 whichever way the sort runs.
    const older = createTestSpot({ name: 'older', metadata: { intensity: 3 }, created_at: '2025-01-01T00:00:00Z' });
    const newer = createTestSpot({ name: 'newer', metadata: { intensity: 3 }, created_at: '2025-01-02T00:00:00Z' });

    for (const direction of [SortDirection.Asc, SortDirection.Desc]) {
      const result = selectSortedSpots([unratedOld, unratedNew, low], SortField.Intensity, direction);

      expect(names(result)).toEqual(['low', 'unrated-new', 'unrated-old']);
      expect(names(selectSortedSpots([older, newer], SortField.Intensity, direction))).toEqual(['newer', 'older']);
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

  it('counts multiple filters', () => {
    expect(
      selectActiveFilterCount({
        ...DEFAULT_FILTERS,
        types: [FeatureType.Rail],
        gear: [GearItem.Winch],
        show_drafts: false,
      }),
    ).toBe(3);
  });
});

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
      gear: [],
    });
  });

  it('toggles units', () => {
    useSettingsStore.getState().setUnits(UnitSystem.Metric);
    expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);
  });

  it('adds gear', () => {
    useSettingsStore.getState().addGear(GearItem.Winch);
    expect(useSettingsStore.getState().gear).toContain(GearItem.Winch);
  });

  it('removes gear', () => {
    useSettingsStore.getState().setGear([GearItem.Winch, GearItem.Bungee]);
    useSettingsStore.getState().removeGear(GearItem.Winch);
    expect(useSettingsStore.getState().gear).toEqual([GearItem.Bungee]);
  });

  it('does not add duplicate gear', () => {
    useSettingsStore.getState().addGear(GearItem.Winch);
    useSettingsStore.getState().addGear(GearItem.Winch);
    expect(useSettingsStore.getState().gear).toHaveLength(1);
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
});
