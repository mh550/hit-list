import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import * as ReactNativeMaps from 'react-native-maps';
import { SpotMap, DRAFT_PIN, SPOT_PIN } from '@/src/components/SpotMap';
import { initialRegion } from '@/src/utils/map-region';
import { SpotStatus } from '@/src/types';
import type { Spot } from '@/src/types';
import { createTestSpot } from './factories';
import { NO_LOCATION } from '@/src/utils/geo';
import { colors, palette } from '@/src/constants/theme';

// The root __mocks__ file replaces react-native-maps (also for react-native-map-clustering's own import) and adds
// the shared MapView method spies. Import the module itself: jest.requireMock('react-native-maps') returns a
// second, separate instance of the mock, whose spies the MapView never calls.
const { mockMapMethods, resetMockMapMethods } = ReactNativeMaps as unknown as typeof import('../../__mocks__/react-native-maps');

// Cities hundreds of km apart so these never merge into a cluster, whatever zoom initialRegion picks.
const SEATTLE = { latitude: 47.6062, longitude: -122.3421 };
const PORTLAND = { latitude: 45.5152, longitude: -122.6784 };
const SPOKANE = { latitude: 47.6588, longitude: -117.426 };
const named = createTestSpot({ name: 'Pier 57 rail', status: SpotStatus.Complete, location: SEATTLE });
const draft = createTestSpot({ name: 'Library ledge', status: SpotStatus.Draft, location: PORTLAND });
const unnamed = createTestSpot({ status: SpotStatus.Complete, location: SPOKANE });

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

// Five spots 5-30 m apart around Pier 57, Seattle. initialRegion() clamps their tiny span to MIN_DELTA (0.01),
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
    status: SpotStatus.Complete,
    location: { latitude: SEATTLE.latitude + dLat, longitude: SEATTLE.longitude + dLng },
  }),
);

describe('SpotMap', () => {
  beforeEach(() => resetMockMapMethods());

  it('renders one marker per spot, titled with the display name', () => {
    renderMap([named, draft, unnamed]);

    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(3);
    expect(screen.getByTestId(`spot-marker-${named.id}`).props.title).toBe('Pier 57 rail');
  });

  it('colours drafts differently from complete spots', () => {
    renderMap([draft, named]);

    expect(screen.getByTestId(`spot-marker-${draft.id}`).props.pinColor).toBe(DRAFT_PIN);
    expect(screen.getByTestId(`spot-marker-${named.id}`).props.pinColor).toBe(SPOT_PIN);
    expect(DRAFT_PIN).not.toBe(SPOT_PIN);
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
    const custom = createTestSpot({ status: SpotStatus.Complete, feature: { type: 'other' as never, custom_type: 'kinked hubba' } });
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
      const seattle = createTestSpot({ name: 'Seattle', status: SpotStatus.Complete, location: SEATTLE });
      const portland = createTestSpot({
        name: 'Portland',
        status: SpotStatus.Complete,
        location: PORTLAND,
      });
      renderMap([seattle, portland]);

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
        expect.arrayContaining(closeSpots.map((s) => ({ latitude: s.location.latitude, longitude: s.location.longitude }))),
      );
    });

    // The cluster must match the app's pin colour, not the library's default teal (#00B386).
    it('colours the cluster with the theme primary and its count white', () => {
      renderMap(closeSpots);

      const count = screen.getByText('5');
      expect(backgroundBehind(count)).toBe(colors.light.primary);
      expect(backgroundBehind(count)).toBe(SPOT_PIN);
      expect(StyleSheet.flatten(count.props.style).color).toBe(palette.white);
    });

    // Several spots at the exact same place (D8) can never separate by zooming, so once the user taps the cluster and
    // the map settles fully zoomed in, the wrapper must fan them out ("spiral") as their own tappable pins.
    it('fans out spots at the same coordinate when zoomed all the way in after a cluster press', () => {
      const sameSpot = [0, 1, 2].map((i) =>
        createTestSpot({ name: `Pier 57 feature ${i}`, status: SpotStatus.Complete, location: SEATTLE }),
      );
      const onOpenSpot = jest.fn();
      renderMap(sameSpot, { onOpenSpot });
      expect(screen.queryAllByTestId(/^spot-marker-/)).toHaveLength(0);

      fireEvent.press(clusterMarkerOf(screen.getByText('3')));
      // The wrapper's zoom (GeoViewport over a bbox of +-delta on Jest's 750x1334 window) is 20 here: >= 18 spirals.
      act(() => {
        screen.getByTestId('map-view').props.onRegionChangeComplete({
          ...SEATTLE,
          latitudeDelta: 0.0005,
          longitudeDelta: 0.0005,
        });
      });

      expect(screen.queryByText('3')).toBeNull();
      const pins = screen.getAllByTestId(/^spot-marker-/);
      expect(pins).toHaveLength(3);
      // Fanned out: each clone sits at its own spiral coordinate, no longer stacked on the shared spot.
      expect(new Set(pins.map((pin) => JSON.stringify(pin.props.coordinate))).size).toBe(3);
      for (const spot of sameSpot) {
        fireEvent(screen.getByTestId(`spot-marker-${spot.id}`), 'calloutPress');
        expect(onOpenSpot).toHaveBeenLastCalledWith(spot.id);
      }
      expect(onOpenSpot).toHaveBeenCalledTimes(3);
    });
  });
});
