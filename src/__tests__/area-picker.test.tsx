import { isValidElement, type ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { geocodeAsync } from 'expo-location';
import * as ReactNativeMaps from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import {
  DEFAULT_FILTERS,
  FeatureType,
  UnitSystem,
  type GeoPoint,
  type HitList,
  type HitListUpdate,
  type NewHitList,
} from '@/src/types';
import { circleRegion } from '@/src/utils/area';
import { NO_LOCATION } from '@/src/utils/geo';
import { initialRegion } from '@/src/utils/map-region';
import { CITIES, createTestHitList, createTestSpot } from './factories';

const mockCreateList = jest.fn(
  (name: string, opts?: NewHitList): Promise<HitList> =>
    Promise.resolve(createTestHitList({ id: 'L-new', name, ...opts })),
);
const mockAddSpotsToList = jest.fn((listId: string, spotIds: string[]): Promise<void> => {
  void listId;
  void spotIds;
  return Promise.resolve();
});
const mockUpdateHitList = jest.fn((id: string, updates: HitListUpdate): Promise<void> => {
  void id;
  void updates;
  return Promise.resolve();
});
const mockDeleteList = jest.fn((id: string): Promise<void> => {
  void id;
  return Promise.resolve();
});
jest.mock('@/src/hooks/use-hit-list-actions', () => ({
  useHitListActions: () => ({
    createList: mockCreateList,
    renameList: jest.fn(),
    updateHitList: mockUpdateHitList,
    deleteList: mockDeleteList,
    addSpotsToList: mockAddSpotsToList,
    removeSpotFromList: jest.fn(),
  }),
}));

import AreaPicker from '@/app/area/index';

const { mockMapMethods } = ReactNativeMaps as unknown as {
  mockMapMethods: { animateToRegion: jest.Mock<void, [region: Region, duration?: number]> };
};

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** A point `meters` due north of `p` (haversine's Earth: 6371 km). */
const north = (p: GeoPoint, meters: number): GeoPoint => ({
  latitude: p.latitude + (meters / 6_371_000) * (180 / Math.PI),
  longitude: p.longitude,
});

/** 23 spots inside the default 2 mi circle around Seattle, 4 well outside, 1 with no location. */
const inside = Array.from({ length: 23 }, (_, i) =>
  createTestSpot({ id: `in-${i}`, location: north(CITIES.seattle, i * 100), feature_types: [FeatureType.Ledge] }),
);
const outside = Array.from({ length: 4 }, (_, i) =>
  createTestSpot({ id: `out-${i}`, location: north(CITIES.seattle, 10_000 + i * 100) }),
);
const unlocated = createTestSpot({ id: 'no-loc', location: NO_LOCATION });

function renderPicker() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AreaPicker />
    </SafeAreaProvider>,
  );
}

const circle = () => screen.getByTestId('map-circle').props as { center: GeoPoint; radius: number };

type ScreenOptions = { title?: string; headerLeft?: () => ReactElement; headerRight?: () => ReactElement };
/** Every Stack.Screen's options, merged in render order (as the navigator merges them). */
function headerOptions(): ScreenOptions {
  const screens = screen.UNSAFE_getAllByType('Stack.Screen' as never);
  return Object.assign({}, ...screens.map((s) => (s.props as { options?: ScreenOptions }).options));
}

/** Presses a header button by calling its onPress (rendering the header as a second root would hide the screen). */
function pressHeader(side: 'headerLeft' | 'headerRight', label: string) {
  const el = headerOptions()[side]!();
  const button = [el, ...((el.props as { children?: unknown }).children as unknown[] ?? [])]
    .flat()
    .find(
      (c): c is ReactElement<{ onPress: () => void }> =>
        // HeaderTextButton's label defaults to its text.
        isValidElement<{ accessibilityLabel?: string; children?: unknown }>(c) &&
        (c.props.accessibilityLabel ?? c.props.children) === label,
    );
  if (!button) throw new Error(`no header button labelled ${label}`);
  act(() => button.props.onPress());
}

function moveMap(center: GeoPoint) {
  act(() =>
    screen.getByTestId('map-view').props.onRegionChangeComplete(
      { ...center, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      { isGesture: true },
    ),
  );
}

beforeEach(() => {
  mockMapMethods.animateToRegion.mockReset();
  jest.mocked(geocodeAsync).mockReset();
  jest.mocked(geocodeAsync).mockResolvedValue([]);
  useSpotsStore.setState({ spots: [], filters: { ...DEFAULT_FILTERS }, searchQuery: '' });
  useLocationStore.setState({ currentLocation: null });
  useSettingsStore.setState({ units: UnitSystem.Imperial });
});

describe('Area picker: map and centre', () => {
  it('starts on the current location when it is known', () => {
    useSpotsStore.setState({ spots: [createTestSpot({ location: CITIES.portland })] });
    useLocationStore.setState({ currentLocation: CITIES.spokane });
    renderPicker();

    expect(circle().center).toEqual(CITIES.spokane);
    expect(screen.getByTestId('area-center-pin')).toBeTruthy();
  });

  it("otherwise starts on the centre of the spots' initial region", () => {
    const spots = [createTestSpot({ location: CITIES.portland }), createTestSpot({ location: CITIES.spokane })];
    useSpotsStore.setState({ spots });
    renderPicker();

    const { latitude, longitude } = initialRegion(spots, null);
    expect(circle().center).toEqual({ latitude, longitude });
    expect(screen.getByTestId('map-view').props.initialRegion).toEqual(
      circleRegion({ latitude, longitude }, 3219),
    );
  });

  it('keeps the start centre when a fix arrives later', () => {
    useSpotsStore.setState({ spots: [createTestSpot({ location: CITIES.portland })] });
    renderPicker();
    act(() => useLocationStore.setState({ currentLocation: CITIES.spokane }));

    expect(circle().center).toEqual(CITIES.portland);
  });

  it('a region change moves the circle and recomputes the count, without geocoding', () => {
    useSpotsStore.setState({ spots: [...inside, ...outside, unlocated] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();
    expect(screen.getByText('23 spots')).toBeTruthy();

    const far = north(CITIES.seattle, 10_150);
    moveMap(far);

    expect(circle().center).toEqual(far);
    expect(screen.getByText('4 spots')).toBeTruthy();
    expect(geocodeAsync).not.toHaveBeenCalled();
  });

  it('pins only the spots inside the circle', () => {
    useSpotsStore.setState({ spots: [...inside, ...outside, unlocated] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    const pins = screen.UNSAFE_getAllByType(ReactNativeMaps.Marker);
    expect(pins.map((p) => p.props.coordinate)).toEqual(inside.map((s) => s.location));
  });
});

describe('Area picker: radius chips', () => {
  it('shows the imperial chips with 2 mi selected by default', () => {
    renderPicker();

    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
    for (const label of ['0.25 mi', '0.5 mi', '1 mi', '2 mi', '5 mi', '10 mi', '25 mi']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('radio', { name: '2 mi' })).toBeChecked();
    expect(circle().radius).toBe(3219);
  });

  it('shows the metric chips with 2 km selected by default', () => {
    useSettingsStore.setState({ units: UnitSystem.Metric });
    renderPicker();

    expect(screen.getAllByRole('radio')).toHaveLength(7);
    for (const label of ['0.5 km', '1 km', '2 km', '5 km', '10 km', '25 km', '50 km']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('radio', { name: '2 km' })).toBeChecked();
    expect(circle().radius).toBe(2000);
  });

  it("pressing '5 mi' sets the circle's radius to 8047 and fits the camera to it", () => {
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    fireEvent.press(screen.getByRole('radio', { name: '5 mi' }));

    expect(circle().radius).toBe(8047);
    expect(screen.getByRole('radio', { name: '5 mi' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '2 mi' })).not.toBeChecked();
    expect(mockMapMethods.animateToRegion).toHaveBeenCalledWith(circleRegion(CITIES.seattle, 8047));
  });

  it('re-tapping the selected chip leaves the camera alone', () => {
    renderPicker();

    fireEvent.press(screen.getByRole('radio', { name: '2 mi' }));

    expect(mockMapMethods.animateToRegion).not.toHaveBeenCalled();
  });

  it('keeps the map\'s initialRegion as it was on mount (a new one could snap the camera back while loading)', () => {
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();
    const mounted = screen.getByTestId('map-view').props.initialRegion;

    moveMap(CITIES.spokane);
    fireEvent.press(screen.getByRole('radio', { name: '5 mi' }));

    expect(screen.getByTestId('map-view').props.initialRegion).toBe(mounted);
    expect(mounted).toEqual(circleRegion(CITIES.seattle, 3219));
  });
});

describe('Area picker: count', () => {
  it("reads '23 spots' for 23 inside, 4 outside and one with no location", () => {
    useSpotsStore.setState({ spots: [...inside, ...outside, unlocated] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    expect(screen.getByText('23 spots')).toBeTruthy();
  });

  it("reads '1 spot' in the singular", () => {
    useSpotsStore.setState({ spots: [inside[0], ...outside] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    expect(screen.getByText('1 spot')).toBeTruthy();
  });

  it('leaves out deleted spots', () => {
    useSpotsStore.setState({ spots: [inside[0], { ...inside[1], deleted_at: '2026-10-02T12:00:00.000Z' }] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    expect(screen.getByText('1 spot')).toBeTruthy();
  });
});

describe('Area picker: place search', () => {
  it('geocodes the submitted text and moves the centre to the first result', async () => {
    const capitolHill = { latitude: 47.625, longitude: -122.3214 };
    jest.mocked(geocodeAsync).mockResolvedValue([capitolHill, CITIES.portland]);
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, '  Capitol Hill ');
    fireEvent(field, 'submitEditing');

    await waitFor(() => expect(circle().center).toEqual(capitolHill));
    expect(geocodeAsync).toHaveBeenCalledWith('Capitol Hill');
    expect(mockMapMethods.animateToRegion).toHaveBeenCalledWith(circleRegion(capitolHill, 3219));
    expect(screen.queryByText('No place found')).toBeNull();
  });

  it('ignores a blank search', () => {
    renderPicker();

    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, '   ');
    fireEvent(field, 'submitEditing');

    expect(geocodeAsync).not.toHaveBeenCalled();
  });

  it("shows 'No place found' for a search with no result, and clears it on the next edit", async () => {
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, 'Nowhere at all');
    fireEvent(field, 'submitEditing');

    expect(await screen.findByText('No place found')).toBeTruthy();
    expect(circle().center).toEqual(CITIES.seattle);

    fireEvent.changeText(field, 'Nowhere at al');
    expect(screen.queryByText('No place found')).toBeNull();
  });

  it("shows 'No place found' when geocoding rejects, with no console.error", async () => {
    const consoleError = jest.spyOn(console, 'error');
    jest.mocked(geocodeAsync).mockRejectedValue(new Error('network down'));
    renderPicker();

    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, 'Capitol Hill');
    fireEvent(field, 'submitEditing');

    expect(await screen.findByText('No place found')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('ignores a result that arrives after a newer search', async () => {
    const first = { latitude: 47.7, longitude: -122.3 };
    const second = { latitude: 47.5, longitude: -122.4 };
    let resolveFirst: (r: GeoPoint[]) => void = () => {};
    jest
      .mocked(geocodeAsync)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([second]);
    renderPicker();

    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, 'First');
    fireEvent(field, 'submitEditing');
    fireEvent.changeText(field, 'Second');
    fireEvent(field, 'submitEditing');
    await waitFor(() => expect(circle().center).toEqual(second));

    await act(async () => resolveFirst([first]));
    expect(circle().center).toEqual(second);
  });
});

describe('Area picker: a search still in flight', () => {
  const hit = { latitude: 47.625, longitude: -122.3214 };
  /** Submits 'Capitol Hill' with a geocode answer the test hands over later. */
  function submitPending() {
    let answer: (r: GeoPoint[]) => void = () => {};
    jest.mocked(geocodeAsync).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, 'Capitol Hill');
    fireEvent(field, 'submitEditing');
    return (r: GeoPoint[]) => act(async () => answer(r));
  }

  it('fits the camera to the radius picked while it was pending', async () => {
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();
    const answer = submitPending();

    fireEvent.press(screen.getByRole('radio', { name: '25 mi' }));
    await answer([hit]);

    expect(circle().center).toEqual(hit);
    expect(mockMapMethods.animateToRegion).toHaveBeenLastCalledWith(circleRegion(hit, 40234));
  });

  it("is dropped after 'Use my location'", async () => {
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();
    const answer = submitPending();

    fireEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    await answer([hit]);

    expect(circle().center).toEqual(CITIES.seattle);
  });

  it('is dropped after the rider drags the map', async () => {
    renderPicker();
    const answer = submitPending();

    moveMap(CITIES.spokane);
    await answer([hit]);

    expect(circle().center).toEqual(CITIES.spokane);
  });

  it("is dropped after an edit, so a late empty answer doesn't bring back 'No place found'", async () => {
    renderPicker();
    const answer = submitPending();

    fireEvent.changeText(screen.getByLabelText('Search a place'), 'Capitol Hil');
    await answer([]);

    expect(screen.queryByText('No place found')).toBeNull();
  });

  it('skips a result with no coordinates (the native geocoder can return nulls)', async () => {
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();
    const answer = submitPending();

    await answer([{ latitude: null, longitude: null } as unknown as GeoPoint]);

    expect(screen.getByText('No place found')).toBeTruthy();
    expect(circle().center).toEqual(CITIES.seattle);
  });
});

describe("Area picker: 'Use my location'", () => {
  it('is disabled with no fix', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: 'Use my location' })).toBeDisabled();
  });

  it('recentres on the current location once there is one', () => {
    useSpotsStore.setState({ spots: [createTestSpot({ location: CITIES.portland })] });
    renderPicker();
    act(() => useLocationStore.setState({ currentLocation: CITIES.spokane }));

    const button = screen.getByRole('button', { name: 'Use my location' });
    expect(button).toBeEnabled();
    fireEvent.press(button);

    expect(circle().center).toEqual(CITIES.spokane);
    expect(mockMapMethods.animateToRegion).toHaveBeenCalledWith(circleRegion(CITIES.spokane, 3219));
  });
});

describe('Area picker: filters', () => {
  it('opens the FilterSheet from the header', () => {
    renderPicker();
    expect(screen.queryByText('Filters')).toBeNull();

    pressHeader('headerRight', 'Filter spots');

    expect(screen.getByText('Filters')).toBeTruthy();
  });

  it("counts only the spots that pass the store's filters", () => {
    const rails = [0, 1, 2].map((i) =>
      createTestSpot({ id: `rail-${i}`, location: north(CITIES.seattle, 50 + i), feature_types: [FeatureType.Rail] }),
    );
    useSpotsStore.setState({ spots: [...inside, ...rails] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();
    expect(screen.getByText('26 spots')).toBeTruthy();

    act(() => useSpotsStore.getState().setFilters({ types: [FeatureType.Rail] }));

    expect(screen.getByText('3 spots')).toBeTruthy();
  });

  it("ignores the Spots tab's text search", () => {
    useSpotsStore.setState({ spots: [inside[0], inside[1]], searchQuery: 'nothing matches this' });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    expect(screen.getByText('2 spots')).toBeTruthy();
  });

  it('shows the active filter count on the header button', () => {
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail] } });
    renderPicker();

    expect(() => pressHeader('headerRight', 'Filter spots, 1 active')).not.toThrow();
    expect((headerOptions().headerRight!().props as { children: string }).children).toBe('Filter (1)');
  });
});

describe('Area picker: header', () => {
  it("'Cancel' goes back", () => {
    const back = jest.fn();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back, replace: jest.fn(), dismissAll: jest.fn() } as never);
    renderPicker();

    pressHeader('headerLeft', 'Cancel');

    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("Area picker: 'Save as hit list'", () => {
  it('is the only bottom action (no Send yet)', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: 'Save as hit list' })).toBeTruthy();
    expect(screen.queryByText(/Send/)).toBeNull();
  });

  it('offers the two ways to save, with their hints', () => {
    useSpotsStore.setState({ spots: [...inside, ...outside] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    fireEvent.press(screen.getByRole('button', { name: 'Save as hit list' }));

    expect(screen.getByRole('button', { name: 'Just these 23 spots' })).toBeTruthy();
    expect(screen.getByText('A normal hit list of the spots inside the circle right now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep it updated' })).toBeTruthy();
    expect(screen.getByText('An area list: your spots inside this circle, now and later')).toBeTruthy();
    expect(screen.queryByText(/Send/)).toBeNull();
  });

  it("'Cancel' only closes the chooser", () => {
    useSpotsStore.setState({ spots: inside });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    fireEvent.press(screen.getByRole('button', { name: 'Save as hit list' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Keep it updated')).toBeNull();
    expect(screen.queryByText('Just these 23 spots')).toBeNull();
    expect(screen.queryByLabelText('List name')).toBeNull();
    expect(mockCreateList).not.toHaveBeenCalled();
  });

  it("hides 'Just these 0 spots' when the circle is empty", () => {
    renderPicker();

    fireEvent.press(screen.getByRole('button', { name: 'Save as hit list' }));

    expect(screen.queryByText(/^Just these/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Keep it updated' })).toBeTruthy();
  });
});

const CAPITOL_HILL = { latitude: 47.625, longitude: -122.3214 };

describe('Area picker: saving a new list (S2-04)', () => {
  const replace = jest.fn();

  beforeEach(() => {
    mockCreateList.mockClear();
    mockAddSpotsToList.mockClear();
    mockDeleteList.mockClear();
    replace.mockReset();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back: jest.fn(), replace, dismissAll: jest.fn() } as never);
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    useSpotsStore.setState({ spots: [...inside, ...outside, unlocated] });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
  });

  function choose(option: string) {
    fireEvent.press(screen.getByRole('button', { name: 'Save as hit list' }));
    fireEvent.press(screen.getByRole('button', { name: option }));
  }

  async function nameIt(name: string) {
    fireEvent.changeText(screen.getByLabelText('List name'), name);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    });
  }

  it.each(['Just these 23 spots', 'Keep it updated'])("'%s' asks for a name in place of the chooser", (option) => {
    renderPicker();
    choose(option);

    expect(screen.getByText('New hit list')).toBeTruthy();
    expect(screen.getByLabelText('List name')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep it updated' })).toBeNull();
  });

  it("'Just these 23 spots' → Create makes a manual list of the 23 spots inside and opens it", async () => {
    renderPicker();
    choose('Just these 23 spots');
    await nameIt('Weekend');

    expect(mockCreateList).toHaveBeenCalledWith('Weekend', { kind: 'manual' });
    expect(mockAddSpotsToList).toHaveBeenCalledTimes(1);
    expect(mockAddSpotsToList).toHaveBeenCalledWith('L-new', inside.map((sp) => sp.id));
    expect(replace).toHaveBeenCalledWith('/list/L-new');
    expect(mockCreateList.mock.invocationCallOrder[0]).toBeLessThan(mockAddSpotsToList.mock.invocationCallOrder[0]);
    expect(mockAddSpotsToList.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0]);
  });

  it("'Keep it updated' → Create makes an area list of the circle, place and filters, with no memberships", async () => {
    jest.mocked(geocodeAsync).mockResolvedValue([CAPITOL_HILL]);
    useSpotsStore.setState({ filters: { types: [FeatureType.Rail], stopped: true } });
    renderPicker();
    const field = screen.getByLabelText('Search a place');
    fireEvent.changeText(field, 'Capitol Hill');
    fireEvent(field, 'submitEditing');
    await waitFor(() => expect(circle().center).toEqual(CAPITOL_HILL));

    choose('Keep it updated');
    await nameIt('Weekend');

    expect(mockCreateList).toHaveBeenCalledWith('Weekend', {
      kind: 'area',
      area_center: CAPITOL_HILL,
      area_radius_m: 3219,
      area_place: 'Capitol Hill',
      area_filters: { types: [FeatureType.Rail], stopped: true },
    });
    expect(mockAddSpotsToList).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/list/L-new');
  });

  it("'Keep it updated' after a drag saves the radius picked and no place", async () => {
    renderPicker();
    fireEvent.press(screen.getByRole('radio', { name: '5 mi' }));
    moveMap(CITIES.portland);

    choose('Keep it updated');
    await nameIt('Portland');

    const [, opts] = mockCreateList.mock.calls[0];
    expect(opts).toEqual(expect.objectContaining({ kind: 'area', area_center: CITIES.portland, area_radius_m: 8047 }));
    expect(opts && 'area_place' in opts ? opts.area_place : undefined).toBeUndefined();
  });

  it("a failed create says so, keeps the name sheet open and doesn't navigate", async () => {
    mockCreateList.mockRejectedValueOnce(new Error('disk full'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderPicker();
    choose('Keep it updated');
    await nameIt('Weekend');

    expect(alertSpy).toHaveBeenCalledWith("Couldn't save the list", 'Please try again.');
    expect(screen.getByLabelText('List name')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("a failed add takes the new list back out, says so and doesn't navigate", async () => {
    mockAddSpotsToList.mockRejectedValueOnce(new Error('disk full'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderPicker();
    choose('Just these 23 spots');
    await nameIt('Weekend');

    expect(mockDeleteList).toHaveBeenCalledWith('L-new');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't save the list", 'Please try again.');
    expect(screen.getByLabelText('List name')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("the name sheet's Cancel closes it without saving", () => {
    renderPicker();
    choose('Keep it updated');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('List name')).toBeNull();
    expect(mockCreateList).not.toHaveBeenCalled();
  });
});

describe('Area picker: editing an area list (S2-04)', () => {
  const back = jest.fn();
  const fremont = { latitude: 47.6505, longitude: -122.3493 };
  const areaList = createTestHitList({
    id: 'L-area',
    name: 'Fremont',
    kind: 'area',
    area_center: fremont,
    area_radius_m: 8047,
    area_place: 'Fremont',
    area_filters: { types: [FeatureType.Rail] },
  });

  beforeEach(() => {
    mockUpdateHitList.mockClear();
    mockCreateList.mockClear();
    back.mockReset();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back, replace: jest.fn(), dismissAll: jest.fn() } as never);
    jest.mocked(useLocalSearchParams).mockReturnValue({ listId: 'L-area' });
    useHitListsStore.setState({ lists: [areaList, createTestHitList({ id: 'L-manual', name: 'Manual' })] });
    useSpotsStore.setState({ filters: { types: [], stopped: true } });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
  });

  afterAll(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    useHitListsStore.setState({ lists: [] });
  });

  it("opens on the list's centre, radius and place, and loads its filters into the shared filters", () => {
    renderPicker();

    expect(circle()).toEqual(expect.objectContaining({ center: fremont, radius: 8047 }));
    expect(screen.getByTestId('map-view').props.initialRegion).toEqual(circleRegion(fremont, 8047));
    expect(screen.getByRole('radio', { name: '5 mi' }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
    expect(useSpotsStore.getState().filters).toEqual({ types: [FeatureType.Rail] });
  });

  it("has the single bottom action 'Save area', which writes the circle, place and filters, then goes back", async () => {
    renderPicker();

    expect(screen.queryByRole('button', { name: 'Save as hit list' })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save area' }));
    });

    expect(mockUpdateHitList).toHaveBeenCalledWith('L-area', {
      area_center: fremont,
      area_radius_m: 8047,
      area_place: 'Fremont',
      area_filters: { types: [FeatureType.Rail] },
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(mockUpdateHitList.mock.invocationCallOrder[0]).toBeLessThan(back.mock.invocationCallOrder[0]);
    expect(mockCreateList).not.toHaveBeenCalled();
  });

  it("'Save area' after a drag away and a new radius clears the place", async () => {
    renderPicker();
    fireEvent.press(screen.getByRole('radio', { name: '1 mi' }));
    moveMap(CITIES.portland);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save area' }));
    });

    expect(mockUpdateHitList).toHaveBeenCalledWith(
      'L-area',
      expect.objectContaining({ area_center: CITIES.portland, area_radius_m: 1609, area_place: null }),
    );
  });

  it("a failed 'Save area' says so and stays", async () => {
    mockUpdateHitList.mockRejectedValueOnce(new Error('disk full'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderPicker();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save area' }));
    });

    expect(alertSpy).toHaveBeenCalledWith("Couldn't save the list", 'Please try again.');
    expect(back).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("keeps a saved radius that isn't a chip of the rider's units, with no chip selected (D56)", () => {
    useSettingsStore.setState({ units: UnitSystem.Metric });
    renderPicker();

    expect(circle().radius).toBe(8047);
    for (const chip of screen.getAllByRole('radio')) {
      expect(chip.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    }
  });

  it.each([
    ['an unknown id', 'L-missing'],
    ['a manual list', 'L-manual'],
  ])("shows 'This list is gone' for %s", (_, listId) => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ listId });
    renderPicker();

    expect(screen.getByText('This list is gone')).toBeTruthy();
    expect(screen.queryByTestId('map-view')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save area' })).toBeNull();
    expect(useSpotsStore.getState().filters).toEqual({ types: [], stopped: true });
    pressHeader('headerLeft', 'Cancel');
    expect(back).toHaveBeenCalledTimes(1);
  });
});
