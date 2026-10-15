import { render, screen, fireEvent } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { SpotMap, DRAFT_PIN, SPOT_PIN } from '@/src/components/SpotMap';
import { initialRegion } from '@/src/utils/map-region';
import { SpotStatus } from '@/src/types';
import type { Spot } from '@/src/types';
import { createTestSpot } from './factories';

const named = createTestSpot({ name: 'Pier 57 rail', status: SpotStatus.Complete });
const draft = createTestSpot({ name: 'Library ledge', status: SpotStatus.Draft });
const unnamed = createTestSpot({ status: SpotStatus.Complete });

const renderMap = (spots: Spot[], props: Partial<Parameters<typeof SpotMap>[0]> = {}) =>
  render(<SpotMap spots={spots} currentLocation={null} onOpenSpot={jest.fn()} {...props} />);

describe('SpotMap', () => {
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
    const lost = createTestSpot({ location: { latitude: 0, longitude: 0 } });
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
});
