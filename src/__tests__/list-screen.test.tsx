import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { useLocationStore } from '@/src/stores/location-store';
import { DEFAULT_FILTERS, FeatureType, SortDirection, SortField, UnitSystem } from '@/src/types';
import { SpotMap } from '@/src/components/SpotMap';
import { useSettingsStore } from '@/src/stores/settings-store';
import { CITIES, createTestHitList, createTestSpot } from './factories';

const mockRenameList = jest.fn((id: string, name: string): Promise<void> => {
  void id;
  void name;
  return Promise.resolve();
});
const mockDeleteList = jest.fn((id: string): Promise<void> => {
  void id;
  return Promise.resolve();
});
const mockRemoveSpotFromList = jest.fn((listId: string, spotId: string): Promise<void> => {
  void listId;
  void spotId;
  return Promise.resolve();
});
jest.mock('@/src/hooks/use-hit-list-actions', () => ({
  useHitListActions: () => ({
    createList: jest.fn(),
    renameList: mockRenameList,
    deleteList: mockDeleteList,
    addSpotsToList: jest.fn(),
    removeSpotFromList: mockRemoveSpotFromList,
  }),
}));

// The sheet is send-sheet.test.tsx's; here only that the list's row opens it with the list's spots.
const mockSendSheet = jest.fn();
jest.mock('@/src/components/SendSheet', () => ({
  SendSheet: (props: unknown) => {
    mockSendSheet(props);
    return null;
  },
}));

import ListScreen from '@/app/list/[id]/index';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown' });
const a = createTestSpot({ id: 'a', name: 'Pier rail', feature_types: [FeatureType.Rail] });
const b = createTestSpot({ id: 'b', name: 'Library ledge', feature_types: [FeatureType.Ledge] });
const c = createTestSpot({ id: 'c', name: 'Not in the list' });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderList() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ListScreen />
    </SafeAreaProvider>,
  );
}

type ScreenOptions = { title?: string; headerTitle?: string | (() => ReactElement); headerRight?: () => ReactElement };
/** Every Stack.Screen's options, merged in render order (as the navigator merges them). */
function headerOptions(): ScreenOptions {
  const screens = screen.UNSAFE_getAllByType('Stack.Screen' as never);
  return Object.assign({}, ...screens.map((s) => (s.props as { options?: ScreenOptions }).options));
}

/**
 * Presses the header's Rename. It calls the element's onPress rather than rendering the header as a second root:
 * fireEvent ignores elements outside the latest root, so the screen's own sheet could no longer be pressed.
 */
function openRename() {
  const bar = headerOptions().headerRight!() as ReactElement<{ children: ReactNode }>;
  const rename = Children.toArray(bar.props.children).find(
    (el) => isValidElement<{ accessibilityLabel?: string }>(el) && el.props.accessibilityLabel === 'Rename list',
  ) as ReactElement<{ onPress: () => void }>;
  act(() => rename.props.onPress());
}

/** The buttons of the last Alert.alert call. */
function lastAlertButtons(spy: jest.SpyInstance): AlertButton[] {
  return spy.mock.calls.at(-1)?.[2] ?? [];
}

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  mockRenameList.mockClear();
  mockDeleteList.mockClear();
  mockRemoveSpotFromList.mockClear();
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockReset().mockReturnValue(true);
  jest.mocked(useRouter).mockReturnValue({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
    dismissAll: jest.fn(),
  } as never);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: downtown.id });
  useSpotsStore.setState({
    spots: [a, b, c],
    filters: { ...DEFAULT_FILTERS },
    searchQuery: '',
    sortField: SortField.Name,
    sortDirection: SortDirection.Asc,
    sortChosen: true,
    viewMode: 'list',
  });
  useMediaStore.setState({ mediaBySpot: {} });
  useLocationStore.setState({ currentLocation: null });
  useHitListsStore.setState({
    lists: [downtown],
    membershipBySpot: { a: [downtown.id], b: [downtown.id] },
    activeListId: null,
  });
});

describe('List screen', () => {
  it("shows the list's spots only, titled with its name", () => {
    renderList();

    expect(screen.getByText('Pier rail')).toBeTruthy();
    expect(screen.getByText('Library ledge')).toBeTruthy();
    expect(screen.queryByText('Not in the list')).toBeNull();
    expect(headerOptions().title).toBe('Downtown');
  });

  it('hands the Map only the list spots', () => {
    renderList();

    fireEvent.press(screen.getByText('Map'));

    expect(screen.UNSAFE_getByType(SpotMap).props.spots).toEqual([a, b]);
  });

  it("applies the Spots tab's filters, scoped to the list", () => {
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail] } });
    renderList();

    expect(screen.getByText('Pier rail')).toBeTruthy();
    expect(screen.queryByText('Library ledge')).toBeNull();
    expect(screen.queryByText('Not in the list')).toBeNull();
  });

  it('shows the empty copy for a list with no spots', () => {
    useHitListsStore.setState({ membershipBySpot: {} });
    renderList();

    expect(screen.getByText('No spots in this list yet')).toBeTruthy();
    expect(screen.getByText("Add from a spot's page or select spots on the Spots tab")).toBeTruthy();
  });

  it('keeps a soft-deleted spot out of the list', () => {
    useSpotsStore.setState({ spots: [a, { ...b, deleted_at: '2026-10-02T12:00:00.000Z' }, c] });
    renderList();

    expect(screen.getByText('Pier rail')).toBeTruthy();
    expect(screen.queryByText('Library ledge')).toBeNull();
  });

  it('keeps the Filter button next to Rename in the header', () => {
    renderList();

    const header = render(headerOptions().headerRight!());
    expect(header.getByLabelText('Rename list')).toBeTruthy();
    expect(header.getByLabelText('Filter spots')).toBeTruthy();
    header.unmount();
  });
});

describe('List screen: rename', () => {
  it('opens the name sheet pre-filled and saves the new name', async () => {
    const view = renderList();
    openRename();

    expect(view.getByText('Rename list')).toBeTruthy();
    const input = view.getByLabelText('List name');
    expect(input.props.value).toBe('Downtown');
    fireEvent.changeText(input, '  Night mission ');
    await act(async () => fireEvent.press(view.getByText('Save')));

    expect(mockRenameList).toHaveBeenCalledWith(downtown.id, 'Night mission');
    expect(view.queryByLabelText('List name')).toBeNull();
  });

  it('keeps the sheet open and alerts when the rename fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRenameList.mockRejectedValueOnce(new Error('disk full'));
    const view = renderList();
    openRename();
    fireEvent.changeText(view.getByLabelText('List name'), 'Night mission');
    await act(async () => fireEvent.press(view.getByText('Save')));

    expect(alert).toHaveBeenCalledWith("Couldn't rename the list", 'Please try again.');
    expect(view.getByLabelText('List name')).toBeTruthy();
  });

  it('Cancel closes the sheet without renaming', () => {
    const view = renderList();
    openRename();
    fireEvent.press(view.getByText('Cancel'));

    expect(view.queryByLabelText('List name')).toBeNull();
    expect(mockRenameList).not.toHaveBeenCalled();
  });
});

describe('List screen: remove a spot', () => {
  it("long press alerts with the spot's name and 'Remove from list' removes it", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderList();

    fireEvent(screen.getByRole('button', { name: /^Pier rail/ }), 'longPress');

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Pier rail');
    const buttons = lastAlertButtons(alert);
    expect(buttons.map((btn) => btn.text)).toEqual(['Remove from list', 'Cancel']);
    expect(buttons[0].style).toBe('destructive');
    await act(async () => buttons[0].onPress?.());

    expect(mockRemoveSpotFromList).toHaveBeenCalledWith(downtown.id, 'a');
  });

  it('a short tap still opens the spot', () => {
    renderList();

    fireEvent.press(screen.getByRole('button', { name: /^Pier rail/ }));

    expect(mockPush).toHaveBeenCalledWith('/spot/a');
  });

  it('alerts when the removal fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRemoveSpotFromList.mockRejectedValueOnce(new Error('disk full'));
    renderList();

    fireEvent(screen.getByRole('button', { name: /^Pier rail/ }), 'longPress');
    await act(async () => lastAlertButtons(alert)[0].onPress?.());

    expect(alert).toHaveBeenLastCalledWith("Couldn't remove the spot", 'Please try again.');
  });
});

describe('List screen: delete', () => {
  it("'Delete list' confirms, deletes the list and goes back", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderList();

    fireEvent.press(screen.getByLabelText('Delete list'));

    expect(alert.mock.calls[0][0]).toBe('Delete Downtown?');
    expect(alert.mock.calls[0][1]).toBe('Spots stay in your library.');
    const buttons = lastAlertButtons(alert);
    expect(buttons.map((btn) => btn.text)).toEqual(['Cancel', 'Delete']);
    expect(buttons[1].style).toBe('destructive');
    await act(async () => buttons[1].onPress?.());

    expect(mockDeleteList).toHaveBeenCalledWith(downtown.id);
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it("doesn't flash 'This list is gone' while it goes back", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // The real hook takes the list out of the store first.
    mockDeleteList.mockImplementationOnce((id) => {
      useHitListsStore.getState().removeList(id);
      return Promise.resolve();
    });
    renderList();

    fireEvent.press(screen.getByLabelText('Delete list'));
    await act(async () => lastAlertButtons(alert)[1].onPress?.());

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('This list is gone')).toBeNull();
  });

  it('opens the Lists tab when there is nothing to go back to (a deep link)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCanGoBack.mockReturnValue(false);
    renderList();

    fireEvent.press(screen.getByLabelText('Delete list'));
    await act(async () => lastAlertButtons(alert)[1].onPress?.());

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/lists');
  });

  it('stays and alerts when the delete fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockDeleteList.mockRejectedValueOnce(new Error('disk full'));
    renderList();

    fireEvent.press(screen.getByLabelText('Delete list'));
    await act(async () => lastAlertButtons(alert)[1].onPress?.());

    expect(mockBack).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith("Couldn't delete the list", 'Please try again.');
  });
});

describe('List screen: gone', () => {
  it("shows 'This list is gone' for an unknown id", () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'no-such-list' });
    renderList();

    expect(screen.getByText('This list is gone')).toBeTruthy();
    expect(screen.getByText('It may have been deleted.')).toBeTruthy();
    expect(screen.queryByText('Pier rail')).toBeNull();
    expect(screen.queryByLabelText('Delete list')).toBeNull();
  });

  it("drops the list's title and header buttons once it is gone", () => {
    renderList();
    act(() => useHitListsStore.getState().removeList(downtown.id));

    const options = headerOptions();
    expect(options.title).toBe('Hit list');
    expect(options.headerRight?.()).toBeNull();
  });

  it("shows 'This list is gone' for a soft-deleted list", () => {
    useHitListsStore.setState({ lists: [{ ...downtown, deleted_at: '2026-10-03T12:00:00.000Z' }] });
    renderList();

    expect(screen.getByText('This list is gone')).toBeTruthy();
    expect(screen.queryByText('Pier rail')).toBeNull();
  });
});

describe('List screen: an area list (S2-04)', () => {
  const weekend = createTestHitList({
    id: 'L-weekend',
    name: 'Weekend',
    kind: 'area',
    area_center: CITIES.seattle,
    area_radius_m: 3219,
    area_place: 'Capitol Hill',
  });
  const near = createTestSpot({ id: 'near', name: 'Near rail', location: CITIES.seattle });
  const far = createTestSpot({ id: 'far', name: 'Far ledge', location: CITIES.portland });

  beforeEach(() => {
    useSettingsStore.setState({ units: UnitSystem.Imperial });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: weekend.id });
    useSpotsStore.setState({ spots: [near, far] });
    // A stale membership row must not matter: an area list's spots come from its circle.
    useHitListsStore.setState({ lists: [weekend], membershipBySpot: { far: [weekend.id] } });
  });

  it('shows the spots inside its circle', () => {
    renderList();

    expect(screen.getByText('Near rail')).toBeTruthy();
    expect(screen.queryByText('Far ledge')).toBeNull();
  });

  it("titles the header with its name over 'Area · 2 mi of Capitol Hill'", () => {
    renderList();

    const { headerTitle } = headerOptions();
    expect(typeof headerTitle).toBe('function');
    render((headerTitle as () => ReactElement)());
    expect(screen.getByText('Weekend')).toBeTruthy();
    expect(screen.getByText('Area · 2 mi of Capitol Hill')).toBeTruthy();
    // VoiceOver reads the two lines as one header.
    expect(screen.getByRole('header', { name: 'Weekend, Area · 2 mi of Capitol Hill' }).props.accessible).toBe(true);
  });

  it('drops the two-line title once the list is gone', () => {
    renderList();
    act(() => useHitListsStore.getState().removeList(weekend.id));

    const screens = screen.UNSAFE_getAllByType('Stack.Screen' as never);
    const options = (screens.at(-1)!.props as { options: ScreenOptions }).options;
    expect('headerTitle' in options).toBe(true);
    expect(options.headerTitle).toBeUndefined();
  });

  it("drops 'of <place>' when the list has no place", () => {
    useHitListsStore.setState({ lists: [{ ...weekend, area_place: undefined }] });
    renderList();

    render((headerOptions().headerTitle as () => ReactElement)());
    expect(screen.getByText('Area · 2 mi')).toBeTruthy();
  });

  it("'Edit area' opens the picker on this list", () => {
    renderList();

    fireEvent.press(screen.getByRole('button', { name: 'Edit area' }));
    expect(mockPush).toHaveBeenCalledWith(`/area?listId=${weekend.id}`);
    expect(screen.getByRole('button', { name: 'Delete list' })).toBeTruthy();
  });

  it("has no 'Remove from list' on a long press (its spots are computed)", () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderList();

    fireEvent(screen.getByRole('button', { name: /^Near rail/ }), 'longPress');
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows the area empty copy when no spot is inside', () => {
    useSpotsStore.setState({ spots: [far] });
    renderList();

    expect(screen.getByText('No spots in this area yet')).toBeTruthy();
    expect(screen.getByText('Spots you save inside the circle show up here')).toBeTruthy();
  });

  it('a manual list keeps the plain title and has no Edit area', () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: downtown.id });
    useHitListsStore.setState({ lists: [downtown, weekend], membershipBySpot: { near: [downtown.id] } });
    renderList();

    expect(headerOptions().title).toBe('Downtown');
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Edit area' })).toBeNull();
  });
});

describe("List screen: 'Send these spots' (S7-04)", () => {
  type SheetProps = { spotIds: string[]; onClose: () => void };
  beforeEach(() => mockSendSheet.mockClear());

  it("shows 'Send these spots · one-time copy of 2 spots' and opens the Send sheet with the list's spots", () => {
    renderList();
    expect(screen.getByText('Send these spots')).toBeTruthy();
    expect(screen.getByText('one-time copy of 2 spots')).toBeTruthy();
    expect(screen.getByTestId('icon-paperplane.fill')).toBeTruthy();
    expect(mockSendSheet).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Send these spots, one-time copy of 2 spots' }));
    const props = mockSendSheet.mock.lastCall?.[0] as SheetProps;
    expect([...props.spotIds].sort()).toEqual(['a', 'b']);

    mockSendSheet.mockClear();
    act(() => props.onClose());
    expect(mockSendSheet).not.toHaveBeenCalled();
  });

  it("a shared list sends only the rider's own spots and counts them; none of their own → no Send row (S8, D87)", () => {
    useAuthStore.setState({ status: 'signed_in', userId: 'u-me', username: 'me' });
    useSpotsStore.setState({ spots: [a, { ...b, owner_id: 'u-ana' }] });
    renderList();
    fireEvent.press(screen.getByRole('button', { name: 'Send these spots, one-time copy of 1 spot' }));
    expect((mockSendSheet.mock.lastCall?.[0] as SheetProps).spotIds).toEqual(['a']);
    screen.unmount();

    useSpotsStore.setState({ spots: [{ ...a, owner_id: 'u-ana' }, { ...b, owner_id: 'u-ana' }] });
    renderList();
    expect(screen.queryByText('Send these spots')).toBeNull();
    act(() => useAuthStore.setState(SIGNED_OUT));
  });

  it("reads 'of 1 spot' for one", () => {
    useHitListsStore.setState({ membershipBySpot: { a: [downtown.id] } });
    renderList();
    expect(screen.getByText('one-time copy of 1 spot')).toBeTruthy();
  });

  it('sends every spot of the list even while a search hides some', () => {
    useSpotsStore.setState({ searchQuery: 'Pier' });
    renderList();
    expect(screen.queryByText('Library ledge')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Send these spots, one-time copy of 2 spots' }));
    expect([...(mockSendSheet.mock.lastCall?.[0] as SheetProps).spotIds].sort()).toEqual(['a', 'b']);
  });

  it('is hidden when the list has no spots', () => {
    useHitListsStore.setState({ membershipBySpot: {} });
    renderList();
    expect(screen.queryByText('Send these spots')).toBeNull();
  });

  it("an area list sends the spots inside its circle", () => {
    const area = createTestHitList({
      id: 'L-area',
      name: 'Near home',
      kind: 'area',
      area_center: CITIES.seattle,
      area_radius_m: 3219,
      area_filters: { types: [] },
    });
    useSpotsStore.setState({
      spots: [
        createTestSpot({ id: 'in', location: CITIES.seattle }),
        createTestSpot({ id: 'out', location: CITIES.portland }),
      ],
    });
    useHitListsStore.setState({ lists: [area], membershipBySpot: {} });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: area.id });
    renderList();

    expect(screen.getByText('one-time copy of 1 spot')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Send these spots, one-time copy of 1 spot' }));
    expect((mockSendSheet.mock.lastCall?.[0] as SheetProps).spotIds).toEqual(['in']);
  });
});
