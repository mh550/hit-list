import {
  selectFilteredSpots,
  selectSortedSpots,
  selectActiveFilterCount,
} from '@/src/stores/spots-store';
import { useSettingsStore } from '@/src/stores/settings-store';
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
import { createTestSpot } from './factories';

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
    const filters: SpotFilters = { ...DEFAULT_FILTERS, search_query: 'winch' };
    const result = selectFilteredSpots(allSpots, filters);
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
    location: { latitude: 47.6062, longitude: -122.3321 },
  });

  const spotB = createTestSpot({
    name: 'Beta',
    created_at: '2025-02-01T00:00:00Z',
    metadata: { intensity: 5 },
    location: { latitude: 45.5152, longitude: -122.6784 },
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
    const userLoc = { latitude: 47.6062, longitude: -122.3321 }; // Seattle
    const result = selectSortedSpots(
      [spotB, spotA],
      SortField.Distance,
      SortDirection.Asc,
      userLoc,
    );
    expect(result[0].name).toBe('Alpha'); // closer to Seattle
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
