import { render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import type { Spot } from '@/src/types';
import { createTestSpot } from './factories';

import SpotDetailScreen from '@/app/spot/[id]/index';

function renderDetail(overrides: Partial<Spot>) {
  const spot = createTestSpot(overrides);
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id } as never);
  render(<SpotDetailScreen />);
}

describe('Spot detail: notes', () => {
  it('shows the notes paragraph when the spot has notes', () => {
    renderDetail({ name: 'Pier 57', notes: 'under the bridge' });

    expect(screen.getByText('Pier 57')).toBeOnTheScreen();
    expect(screen.getByText('under the bridge')).toBeOnTheScreen();
  });

  it('shows no Notes label when the spot has no notes', () => {
    renderDetail({ name: 'Pier 57' });

    expect(screen.getByText('Pier 57')).toBeOnTheScreen();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('shows none of the removed sections (D17)', () => {
    renderDetail({ name: 'Pier 57', notes: 'under the bridge' });

    for (const title of ['Feature', 'In-Run', 'Landing', 'Details']) expect(screen.queryByText(title)).toBeNull();
  });
});
