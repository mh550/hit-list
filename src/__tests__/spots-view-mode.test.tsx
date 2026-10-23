import { RefreshControl } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';
import { DEFAULT_FILTERS } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';

import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';
import { syncNow } from '@/src/sync/engine';

import SpotsScreen from '@/app/(tabs)/index';

jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));

const spots = [
  createTestSpot({ name: 'Pier 57 rail', location: CITIES.seattle }),
  createTestSpot({ name: 'Library ledge', stopped: true, location: CITIES.portland }),
  createTestSpot({ name: 'Bank to wall', location: CITIES.spokane }),
];

describe('Spots tab Map | List toggle', () => {
  beforeEach(() => {
    useSpotsStore.setState({ spots, filters: { ...DEFAULT_FILTERS }, viewMode: 'list' });
    useMediaStore.setState({ mediaBySpot: {} });
  });

  it('defaults to the list', () => {
    render(<SpotsScreen />);

    expect(screen.queryByTestId('map-view')).toBeNull();
    expect(screen.getByText('Pier 57 rail')).toBeTruthy();
  });

  it('shows each row with its Stopped tag and speed bar', () => {
    useSpotsStore.setState({
      spots: [
        createTestSpot({ name: 'Library ledge', stopped: true, natural_speed: 3, location: CITIES.portland }),
        createTestSpot({ name: 'Pier 57 rail', location: CITIES.seattle }),
      ],
    });
    render(<SpotsScreen />);

    expect(screen.getAllByText('Stopped')).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Natural speed: /).map((e) => e.props.accessibilityLabel)).toEqual([
      'Natural speed: Enough',
    ]);
  });

  it('switches to the map and back, keeping the choice in the store', () => {
    render(<SpotsScreen />);

    fireEvent.press(screen.getByText('Map'));
    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(useSpotsStore.getState().viewMode).toBe('map');

    fireEvent.press(screen.getByText('List'));
    expect(screen.queryByTestId('map-view')).toBeNull();
    expect(useSpotsStore.getState().viewMode).toBe('list');
  });

  it('shows exactly the filtered spots on the map', () => {
    useSpotsStore.setState({ viewMode: 'map', filters: { ...DEFAULT_FILTERS, stopped: false } });

    render(<SpotsScreen />);

    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(2);
  });

  it('keeps the map and the add button in map mode, even with no spots', () => {
    useSpotsStore.setState({ viewMode: 'map', spots: [] });

    render(<SpotsScreen />);

    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(screen.getByLabelText('Add new spot')).toBeTruthy();
    expect(screen.queryByText('No Spots Yet')).toBeNull();
  });
});

describe('Spots tab list picker', () => {
  const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown' });
  const bridges = createTestHitList({ id: 'L-bridges', name: 'Bridges' });
  const [pier, library, bank] = spots;

  beforeEach(() => {
    useSpotsStore.setState({ spots, filters: { ...DEFAULT_FILTERS }, searchQuery: '', viewMode: 'list' });
    useMediaStore.setState({ mediaBySpot: {} });
    useHitListsStore.setState({
      lists: [downtown, bridges],
      membershipBySpot: { [pier.id]: [downtown.id], [bank.id]: [downtown.id] },
      activeListId: null,
    });
  });

  afterAll(() => useHitListsStore.setState({ lists: [], membershipBySpot: {}, activeListId: null }));

  it("shows the picker above the views with 'My spots' selected and every spot", () => {
    render(<SpotsScreen />);

    expect(screen.getByRole('tab', { name: 'My spots' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('tab', { name: 'Downtown' })).toBeTruthy();
    expect(screen.getByText('Library ledge')).toBeTruthy();
  });

  it('with a list active, the List shows only its two spots', () => {
    useHitListsStore.setState({ activeListId: downtown.id });
    render(<SpotsScreen />);

    expect(screen.getByText('Pier 57 rail')).toBeTruthy();
    expect(screen.getByText('Bank to wall')).toBeTruthy();
    expect(screen.queryByText('Library ledge')).toBeNull();
  });

  it('with a list active, the Map gets only its two spots', () => {
    useHitListsStore.setState({ activeListId: downtown.id });
    useSpotsStore.setState({ viewMode: 'map' });
    render(<SpotsScreen />);

    expect(screen.getAllByTestId(/^spot-marker-/).map((m) => m.props.testID).sort()).toEqual(
      [`spot-marker-${pier.id}`, `spot-marker-${bank.id}`].sort(),
    );
  });

  it('pressing a list chip scopes the list, and My spots brings every spot back', () => {
    render(<SpotsScreen />);

    fireEvent.press(screen.getByRole('tab', { name: 'Downtown' }));
    expect(screen.queryByText('Library ledge')).toBeNull();
    expect(screen.getByText('Pier 57 rail')).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: 'My spots' }));
    expect(screen.getByText('Library ledge')).toBeTruthy();
  });

  it("an empty active list reads 'No spots in this list yet' with no action", () => {
    useHitListsStore.setState({ activeListId: bridges.id });
    render(<SpotsScreen />);

    expect(screen.getByText('No spots in this list yet')).toBeTruthy();
    expect(screen.getByText("Add from a spot's page or select spots on the Spots tab")).toBeTruthy();
    expect(screen.queryByText('No Spots Yet')).toBeNull();
    expect(screen.queryByText('Add Spot')).toBeNull();
  });

  it("an empty active area list reads the area copy, not 'select spots' (its spots are computed)", () => {
    const empty = createTestHitList({
      id: 'L-area',
      name: 'Far away',
      kind: 'area',
      area_center: { latitude: 46.2, longitude: -119.1 }, // no fixture spot near
      area_radius_m: 402,
    });
    useHitListsStore.setState({ lists: [downtown, bridges, empty], activeListId: empty.id });
    render(<SpotsScreen />);

    expect(screen.getByText('No spots in this area yet')).toBeTruthy();
    expect(screen.getByText('Spots you save inside the circle show up here')).toBeTruthy();
    expect(screen.queryByText('No spots in this list yet')).toBeNull();
  });

  it('a deleted spot in the active list does not show', () => {
    useSpotsStore.setState({ spots: [pier, { ...bank, deleted_at: '2026-10-02T12:00:00.000Z' }, library] });
    useHitListsStore.setState({ activeListId: downtown.id });
    render(<SpotsScreen />);

    expect(screen.getByText('Pier 57 rail')).toBeTruthy();
    expect(screen.queryByText('Bank to wall')).toBeNull();
  });

  it('deleting the active list goes back to every spot', () => {
    useHitListsStore.setState({ activeListId: downtown.id });
    render(<SpotsScreen />);
    expect(screen.queryByText('Library ledge')).toBeNull();

    act(() => useHitListsStore.getState().removeList(downtown.id));

    expect(useHitListsStore.getState().activeListId).toBeNull();
    expect(screen.getByRole('tab', { name: 'My spots' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Library ledge')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Downtown' })).toBeNull();
  });
});

describe("Spots tab: others' spots (S8, D47)", () => {
  const crew = createTestHitList({ id: 'L-crew', name: 'Crew', owner_id: 'rider-ana', shared: true });
  const mine = createTestSpot({ name: 'My rail', owner_id: 'rider-me', location: CITIES.seattle });
  const anas = createTestSpot({ name: "Ana's ledge", owner_id: 'rider-ana', location: CITIES.portland });

  beforeEach(() => {
    useSpotsStore.setState({ spots: [mine, anas], filters: { ...DEFAULT_FILTERS }, searchQuery: '', viewMode: 'list' });
    useMediaStore.setState({ mediaBySpot: {} });
    useHitListsStore.setState({
      lists: [crew],
      membershipBySpot: { [mine.id]: [crew.id], [anas.id]: [crew.id] },
      activeListId: null,
    });
    useAuthStore.setState({ status: 'signed_in', userId: 'rider-me', email: null, username: 'me', displayName: null });
  });
  afterEach(() => act(() => useAuthStore.setState(SIGNED_OUT)));
  afterAll(() => useHitListsStore.setState({ lists: [], membershipBySpot: {}, activeListId: null }));

  it("'My spots' leaves a friend's spot out; the shared list's chip shows it with the rider's own", () => {
    render(<SpotsScreen />);
    expect(screen.getByText('My rail')).toBeTruthy();
    expect(screen.queryByText("Ana's ledge")).toBeNull();

    fireEvent.press(screen.getByRole('tab', { name: 'Crew' }));
    expect(screen.getByText('My rail')).toBeTruthy();
    expect(screen.getByText("Ana's ledge")).toBeTruthy();
  });
});

describe('Spots tab pull-to-refresh', () => {
  beforeEach(() => {
    useSpotsStore.setState({ spots, filters: { ...DEFAULT_FILTERS }, searchQuery: '', viewMode: 'list' });
    useMediaStore.setState({ mediaBySpot: {} });
    useHitListsStore.setState({ lists: [], membershipBySpot: {}, activeListId: null });
    useSyncStore.setState(INITIAL_SYNC);
    jest.mocked(syncNow).mockClear();
  });
  afterEach(() => act(() => useAuthStore.setState(SIGNED_OUT)));

  it('signed in, the list has a RefreshControl that syncs, refreshing until the sync it started ends', async () => {
    let finish!: () => void;
    jest.mocked(syncNow).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    useAuthStore.setState({ status: 'signed_in', userId: 'rider-me', email: null, username: 'me', displayName: null });
    render(<SpotsScreen />);

    const control = screen.UNSAFE_getByType(RefreshControl);
    expect(control.props.refreshing).toBe(false);
    act(() => control.props.onRefresh());
    expect(syncNow).toHaveBeenCalledWith(useSQLiteContext());
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);

    await act(async () => finish());
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('a background sync (launch, foreground, the 5-minute timer) shows no pull-to-refresh spinner', () => {
    useAuthStore.setState({ status: 'signed_in', userId: 'rider-me', email: null, username: 'me', displayName: null });
    render(<SpotsScreen />);

    act(() => useSyncStore.setState({ syncing: true }));

    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('signed out (or unconfigured) the list has no RefreshControl', () => {
    useAuthStore.setState(SIGNED_OUT);
    const { rerender } = render(<SpotsScreen />);
    expect(screen.UNSAFE_queryByType(RefreshControl)).toBeNull();

    act(() => useAuthStore.setState({ ...SIGNED_OUT, status: 'unconfigured' }));
    rerender(<SpotsScreen />);
    expect(screen.UNSAFE_queryByType(RefreshControl)).toBeNull();
  });
});
