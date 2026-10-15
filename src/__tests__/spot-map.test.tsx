import { render, screen, fireEvent } from '@testing-library/react-native';
import { SpotMap, DRAFT_PIN, SPOT_PIN } from '@/src/components/SpotMap';
import { initialRegion } from '@/src/utils/map-region';
import { SpotStatus } from '@/src/types';
import { createTestSpot } from './factories';

const named = createTestSpot({ name: 'Pier 57 rail', status: SpotStatus.Complete });
const draft = createTestSpot({ name: 'Library ledge', status: SpotStatus.Draft });
const unnamed = createTestSpot({ status: SpotStatus.Complete });

describe('SpotMap', () => {
  it('renders one marker per spot, titled with the display name', () => {
    render(<SpotMap spots={[named, draft, unnamed]} currentLocation={null} onOpenSpot={jest.fn()} />);

    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(3);
    expect(screen.getByTestId(`spot-marker-${named.id}`).props.title).toBe('Pier 57 rail');
  });

  it('colours drafts differently from complete spots', () => {
    render(<SpotMap spots={[draft, named]} currentLocation={null} onOpenSpot={jest.fn()} />);

    expect(screen.getByTestId(`spot-marker-${draft.id}`).props.pinColor).toBe(DRAFT_PIN);
    expect(screen.getByTestId(`spot-marker-${named.id}`).props.pinColor).toBe(SPOT_PIN);
    expect(DRAFT_PIN).not.toBe(SPOT_PIN);
  });

  it('opens the spot when its callout is pressed', () => {
    const onOpenSpot = jest.fn();
    render(<SpotMap spots={[named]} currentLocation={null} onOpenSpot={onOpenSpot} />);

    fireEvent(screen.getByTestId(`spot-marker-${named.id}`), 'calloutPress');

    expect(onOpenSpot).toHaveBeenCalledWith(named.id);
  });

  it('starts on the region from initialRegion and shows the user location', () => {
    const here = { latitude: 40, longitude: -74 };
    render(<SpotMap spots={[named]} currentLocation={here} onOpenSpot={jest.fn()} />);

    const map = screen.getByTestId('map-view');
    expect(map.props.initialRegion).toEqual(initialRegion([named], here));
    expect(map.props.showsUserLocation).toBe(true);
  });

  it('leaves spots without a location (0, 0) off the map', () => {
    const lost = createTestSpot({ location: { latitude: 0, longitude: 0 } });
    render(<SpotMap spots={[named, lost]} currentLocation={null} onOpenSpot={jest.fn()} />);

    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(1);
    expect(screen.queryByTestId(`spot-marker-${lost.id}`)).toBeNull();
  });
});
