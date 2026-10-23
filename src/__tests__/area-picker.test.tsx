import { isValidElement, type ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { geocodeAsync } from 'expo-location';
import * as ReactNativeMaps from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import { DEFAULT_FILTERS, FeatureType, UnitSystem, type GeoPoint } from '@/src/types';
import { circleRegion } from '@/src/utils/area';
import { NO_LOCATION } from '@/src/utils/geo';
import { initialRegion } from '@/src/utils/map-region';
import { CITIES, createTestSpot } from './factories';

jest.mock('@/src/hooks/use-hit-list-actions', () => ({
  useHitListActions: () => ({
    createList: jest.fn(),
    renameList: jest.fn(),
    deleteList: jest.fn(),
    addSpotsToList: jest.fn(),
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

  it.each(['Just these 23 spots', 'Keep it updated', 'Cancel'])("'%s' only closes the chooser (S2-03)", (option) => {
    useSpotsStore.setState({ spots: inside });
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    renderPicker();

    fireEvent.press(screen.getByRole('button', { name: 'Save as hit list' }));
    fireEvent.press(screen.getByRole('button', { name: option }));

    expect(screen.queryByText('Keep it updated')).toBeNull();
    expect(screen.queryByText('Just these 23 spots')).toBeNull();
    expect(screen.queryByLabelText('List name')).toBeNull();
  });

  it("hides 'Just these 0 spots' when the circle is empty", () => {
    renderPicker();

    fireEvent.press(screen.getByRole('button', { name: 'Save as hit list' }));

    expect(screen.queryByText(/^Just these/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Keep it updated' })).toBeTruthy();
  });
});
