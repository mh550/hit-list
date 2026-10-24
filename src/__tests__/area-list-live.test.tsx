import { act, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getListMemberships, getSpots, insertHitList } from '@/src/db';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { DEFAULT_FILTERS, SortDirection, SortField, type GeoPoint } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';
import { createMigratedTestDb } from './helpers/node-sqlite-db';

import ListScreen from '@/app/list/[id]/index';

let mockDb: SQLiteDatabase;
jest.mock('expo-sqlite', () => ({
  ...jest.requireActual('expo-sqlite'),
  useSQLiteContext: () => mockDb,
}));

/** A point `meters` due north of `p` (haversine's Earth: 6371 km). */
const north = (p: GeoPoint, meters: number): GeoPoint => ({
  latitude: p.latitude + (meters / 6_371_000) * (180 / Math.PI),
  longitude: p.longitude,
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const around = createTestHitList({
  id: 'L-around',
  name: 'Around downtown',
  kind: 'area',
  area_center: CITIES.seattle,
  area_radius_m: 1609,
  area_filters: { ...DEFAULT_FILTERS },
});

beforeEach(async () => {
  mockDb = await createMigratedTestDb();
  await insertHitList(mockDb, around);
  useHitListsStore.setState({ lists: [around], membershipBySpot: {}, activeListId: null });
  useSpotsStore.setState({
    spots: [],
    filters: { ...DEFAULT_FILTERS },
    searchQuery: '',
    sortField: SortField.Name,
    sortDirection: SortDirection.Asc,
    sortChosen: true,
    viewMode: 'list',
  });
  useMediaStore.setState({ mediaBySpot: {} });
  useLocationStore.setState({ currentLocation: null });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: around.id });
});

/** The spot actions first: `screen` follows the latest render, which must be the list. */
function renderListWithActions() {
  const { result } = renderHook(() => useSpotActions());
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ListScreen />
    </SafeAreaProvider>,
  );
  return result;
}

describe('An area list is live (S2-04, real SQLite)', () => {
  it('shows a spot saved 500 m from the centre with no other action, and not one saved 2 km away', async () => {
    const actions = renderListWithActions();
    expect(screen.getByText('No spots in this area yet')).toBeTruthy();

    await act(async () => {
      await actions.current.addSpot(createTestSpot({ id: 'near', name: 'Near rail', location: north(CITIES.seattle, 500) }));
      await actions.current.addSpot(createTestSpot({ id: 'far', name: 'Far ledge', location: north(CITIES.seattle, 2000) }));
    });

    expect(screen.getByText('Near rail')).toBeTruthy();
    expect(screen.queryByText('Far ledge')).toBeNull();
    // Both are saved, and nothing wrote a membership: the list is its circle.
    expect((await getSpots(mockDb)).map((s) => s.id).sort()).toEqual(['far', 'near']);
    expect(await getListMemberships(mockDb)).toEqual({});
  });
});
