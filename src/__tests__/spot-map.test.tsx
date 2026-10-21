import { ActionSheetIOS, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import * as ReactNativeMaps from 'react-native-maps';
import { SpotMap, SPOT_PIN } from '@/src/components/SpotMap';
import { initialRegion } from '@/src/utils/map-region';
import type { Spot } from '@/src/types';
import { CITIES, createTestSpot } from './factories';
import { NO_LOCATION } from '@/src/utils/geo';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { palette } from '@/src/constants/theme';

// The root __mocks__ file replaces react-native-maps (also for react-native-map-clustering's own import) and adds
// the shared MapView method spies. Import the module itself: jest.requireMock('react-native-maps') returns a
// second, separate instance of the mock, whose spies the MapView never calls.
const { mockMapMethods } = ReactNativeMaps as unknown as typeof import('../../__mocks__/react-native-maps');

const named = createTestSpot({ name: 'Pier 57 rail', location: CITIES.seattle });
const stopped = createTestSpot({ name: 'Library ledge', stopped: true, location: CITIES.portland });
const unnamed = createTestSpot({ location: CITIES.spokane });

/** The background colour of the nearest ancestor that paints one (the cluster's coloured circle behind its count). */
function backgroundBehind(element: ReactTestInstance): unknown {
  for (let node = element.parent; node; node = node.parent) {
    const { backgroundColor } = StyleSheet.flatten(node.props.style) ?? {};
    if (backgroundColor) return backgroundColor;
  }
  return undefined;
}

/**
 * The cluster's map marker: the nearest ancestor of its count text that has an onPress. Real taps arrive from the
 * native map straight at the Marker, but RNTL's press stops at the TouchableOpacity responder in between.
 */
function clusterMarkerOf(count: ReactTestInstance): ReactTestInstance {
  for (let node = count.parent; node; node = node.parent) {
    if (typeof node.props.onPress === 'function') return node;
  }
  throw new Error('cluster marker with onPress not found');
}

const renderMap = (spots: Spot[], props: Partial<Parameters<typeof SpotMap>[0]> = {}) =>
  render(<SpotMap spots={spots} currentLocation={null} onOpenSpot={jest.fn()} {...props} />);

// Five spots 5-30 m apart in central Seattle. initialRegion() clamps their tiny span to MIN_DELTA (0.01),
// so the clustering zoom is 15 (~3.2 m/px, a 45 px radius is over 100 m): they all fall in one cluster.
const closeSpots = [
  [0, 0],
  [0.00005, 0.00005], // ~5.6 m N, ~3.8 m E
  [-0.00008, 0.0001], // ~8.9 m S, ~7.5 m E
  [0.0001, -0.00015], // ~11 m N, ~11 m W
  [-0.00015, -0.0002], // ~17 m S, ~15 m W
].map(([dLat, dLng], i) =>
  createTestSpot({
    name: `Pier 57 spot ${i}`,
    location: { latitude: CITIES.seattle.latitude + dLat, longitude: CITIES.seattle.longitude + dLng },
  }),
);

describe('SpotMap', () => {
  beforeEach(() => mockMapMethods.fitToCoordinates.mockReset());

  it('renders one marker per spot, titled with the display name', () => {
    renderMap([named, stopped, unnamed]);

    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(3);
    expect(screen.getByTestId(`spot-marker-${named.id}`).props.title).toBe('Pier 57 rail');
  });

  it('gives every pin the one spot colour (D20: no draft colour)', () => {
    renderMap([named, stopped, unnamed]);

    for (const marker of screen.getAllByTestId(/^spot-marker-/)) expect(marker.props.pinColor).toBe(SPOT_PIN);
  });

  it('leaves the callout description empty for a spot with no feature types', () => {
    renderMap([named]);

    expect(screen.getByTestId(`spot-marker-${named.id}`).props.description).toBeUndefined();
  });

  it('opens the spot when its callout is pressed', () => {
    const onOpenSpot = jest.fn();
    renderMap([named], { onOpenSpot });

    fireEvent(screen.getByTestId(`spot-marker-${named.id}`), 'calloutPress');

    expect(onOpenSpot).toHaveBeenCalledWith(named.id);
  });

  it('starts on the region from initialRegion and shows the user location', () => {
    const here = { latitude: 40, longitude: -74 };
    renderMap([named], { currentLocation: here });

    const map = screen.getByTestId('map-view');
    expect(map.props.initialRegion).toEqual(initialRegion([named], here));
    expect(map.props.showsUserLocation).toBe(true);
  });

  it('leaves spots without a location (0, 0) off the map', () => {
    const lost = createTestSpot({ location: NO_LOCATION });
    renderMap([named, lost]);

    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(1);
    expect(screen.queryByTestId(`spot-marker-${lost.id}`)).toBeNull();
  });

  it('shows the custom feature name for "other" in the callout', () => {
    const custom = createTestSpot({ feature: { type: 'other' as never, custom_type: 'kinked hubba' } });
    renderMap([custom]);

    expect(screen.getByTestId(`spot-marker-${custom.id}`).props.description).toBe('kinked hubba');
  });

  it('tracks the user only while the tab is focused', () => {
    jest.mocked(useIsFocused).mockReturnValueOnce(false);
    renderMap([named]);

    expect(screen.getByTestId('map-view').props.showsUserLocation).toBe(false);
  });

  describe('clustering (D8)', () => {
    // Spots that overlap as pins must collapse to one numbered cluster instead of five stacked pins.
    it('groups five spots at one place into a single cluster marked 5', () => {
      renderMap(closeSpots);

      expect(screen.queryAllByTestId(/^spot-marker-/)).toHaveLength(0);
      expect(screen.getAllByText(/^\d+$/)).toHaveLength(1);
      expect(screen.getByText('5')).toBeTruthy();
    });

    // Spots in different cities must stay separate pins, not be pulled into a cluster.
    it('keeps spots far apart as individual pins with no cluster', () => {
      renderMap([named, stopped]);

      expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(2);
      expect(screen.queryAllByText(/^\d+$/)).toHaveLength(0);
    });

    // Tapping a cluster must zoom to the spots inside it (the map-clustering default behaviour).
    it('zooms to the clustered spots when the cluster is pressed', () => {
      renderMap(closeSpots);

      fireEvent.press(clusterMarkerOf(screen.getByText('5')));

      expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledTimes(1);
      const [coordinates] = mockMapMethods.fitToCoordinates.mock.calls[0];
      expect(coordinates).toHaveLength(5);
      expect(coordinates).toEqual(
        expect.arrayContaining(closeSpots.map((s) => s.location)),
      );
    });

    // The cluster must match the app's pin colour, not the library's default teal (#00B386).
    it('colours the cluster with the pin colour and its count white', () => {
      renderMap(closeSpots);

      const count = screen.getByText('5');
      expect(backgroundBehind(count)).toBe(SPOT_PIN);
      expect(StyleSheet.flatten(count.props.style).color).toBe(palette.white);
    });

    describe('cluster press', () => {
      type SheetOptions = Parameters<typeof ActionSheetIOS.showActionSheetWithOptions>[0];
      type SheetCallback = Parameters<typeof ActionSheetIOS.showActionSheetWithOptions>[1];
      let sheet: jest.SpyInstance<void, [SheetOptions, SheetCallback]>;

      // Restore only this spy: jest.restoreAllMocks() would also reset the global jest.fn mocks from jest.setup.ts.
      beforeEach(() => {
        sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
      });
      afterEach(() => sheet.mockRestore());

      // Two places 23 m apart (0.00021 deg of latitude) in Seattle: CITIES.seattle and POINT_B.
      const POINT_B = { latitude: CITIES.seattle.latitude + 0.00021, longitude: CITIES.seattle.longitude };

      // Spots at the exact same place can never be pulled apart by zooming, so tapping their cluster must list them.
      it('lists spots that share one coordinate in an action sheet instead of zooming', () => {
        const rail = createTestSpot({ name: 'Pier 57 rail', location: CITIES.seattle });
        const ledge = createTestSpot({ name: 'Pier 57 ledge', location: CITIES.seattle });
        const untitled = createTestSpot({ location: CITIES.seattle });
        const onOpenSpot = jest.fn();
        renderMap([rail, ledge, untitled], { onOpenSpot });

        fireEvent.press(clusterMarkerOf(screen.getByText('3')));

        expect(sheet).toHaveBeenCalledTimes(1);
        const [options, callback] = sheet.mock.calls[0];
        const names = [rail, ledge, untitled].map(getSpotDisplayName);
        expect(options.options).toHaveLength(4);
        expect(options.options.slice(0, 3)).toEqual(expect.arrayContaining(names));
        expect(options.options[3]).toBe('Cancel');
        expect(options.cancelButtonIndex).toBe(3);
        expect(mockMapMethods.fitToCoordinates).not.toHaveBeenCalled();

        // Choosing a name opens that spot; Cancel opens nothing.
        callback(options.options.indexOf('Pier 57 ledge'));
        expect(onOpenSpot).toHaveBeenCalledTimes(1);
        expect(onOpenSpot).toHaveBeenLastCalledWith(ledge.id);
        callback(options.cancelButtonIndex as number);
        expect(onOpenSpot).toHaveBeenCalledTimes(1);
      });

      // Reviewer's failing case: with the library's spiral, zooming in on two same-place groups made one vanish.
      it('keeps both same-place groups tappable after zooming in on a mixed cluster', () => {
        // Two pairs, each pair sharing one exact coordinate.
        const groupA = [
          createTestSpot({ name: 'Pier 57 rail', location: CITIES.seattle }),
          createTestSpot({ name: 'Pier 57 ledge', location: CITIES.seattle }),
        ];
        const groupB = [
          createTestSpot({ name: 'Pier 57 stairs', location: POINT_B }),
          createTestSpot({ name: 'Pier 57 bank', location: POINT_B }),
        ];
        const onOpenSpot = jest.fn();
        renderMap([...groupA, ...groupB], { onOpenSpot });

        // At the initial zoom (15, ~72 m radius) all four merge, and 23 m apart they can be separated by zooming.
        fireEvent.press(clusterMarkerOf(screen.getByText('4')));
        expect(sheet).not.toHaveBeenCalled();
        expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledTimes(1);
        expect(mockMapMethods.fitToCoordinates.mock.calls[0][0]).toHaveLength(4);

        // The map settles zoomed in. Delta 0.0005 around the midpoint gives zoom 20 on Jest's 750x1334 window
        // (0.050 m/px, cluster radius 45 px = 2.3 m), so A and B are ~465 px apart: separate clusters; both lie
        // inside the +-0.0005 box (each ~11.7 m from the centre).
        act(() => {
          screen.getByTestId('map-view').props.onRegionChangeComplete({
            latitude: (CITIES.seattle.latitude + POINT_B.latitude) / 2,
            longitude: CITIES.seattle.longitude,
            latitudeDelta: 0.0005,
            longitudeDelta: 0.0005,
          });
        });

        expect(screen.getAllByText('2')).toHaveLength(2);
        expect(screen.queryByText('4')).toBeNull();

        const groupNames = [groupA, groupB].map((group) => group.map(getSpotDisplayName).sort());
        const opened: string[][] = [];
        for (const index of [0, 1]) {
          sheet.mockClear();
          fireEvent.press(clusterMarkerOf(screen.getAllByText('2')[index]));
          expect(sheet).toHaveBeenCalledTimes(1);
          const { options, cancelButtonIndex } = sheet.mock.calls[0][0];
          expect(options).toHaveLength(3);
          expect(options[2]).toBe('Cancel');
          expect(cancelButtonIndex).toBe(2);
          opened.push(options.slice(0, 2).sort());
        }
        // One cluster lists group A, the other group B.
        expect(opened).toEqual(expect.arrayContaining(groupNames));
        expect(opened[0]).not.toEqual(opened[1]);
      });

      // A cluster whose spots are spread out (five spots up to ~31 m apart) is for zooming, never for the list.
      it('opens no action sheet for a cluster of spread-out spots', () => {
        renderMap(closeSpots);

        fireEvent.press(clusterMarkerOf(screen.getByText('5')));

        expect(sheet).not.toHaveBeenCalled();
        expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledTimes(1);
      });
    });
  });
});
