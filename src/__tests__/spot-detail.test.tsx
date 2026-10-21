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

  it('shows only the title and the notes, no section from the removed model (D17)', () => {
    renderDetail({ name: 'Pier 57', notes: 'under the bridge' });

    const texts = screen.getAllByText(/./).map((t) => t.props.children);
    expect(texts).toEqual(['Pier 57', 'Notes', 'under the bridge']);
  });
});
