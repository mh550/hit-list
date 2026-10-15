import { render, screen, fireEvent } from '@testing-library/react-native';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { DEFAULT_FILTERS, SpotStatus } from '@/src/types';
import { CITIES, createTestSpot } from './factories';

import SpotsScreen from '@/app/(tabs)/index';

const spots = [
  createTestSpot({ name: 'Pier 57 rail', status: SpotStatus.Complete, location: CITIES.seattle }),
  createTestSpot({ name: 'Library ledge', status: SpotStatus.Draft, location: CITIES.portland }),
  createTestSpot({ name: 'Bank to wall', status: SpotStatus.Complete, location: CITIES.spokane }),
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
    useSpotsStore.setState({ viewMode: 'map', filters: { ...DEFAULT_FILTERS, show_drafts: false } });

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
