import { render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { StopType } from '@/src/types';
import type { Spot } from '@/src/types';
import { createTestSpot } from './factories';

import SpotDetailScreen from '@/app/spot/[id]/index';

function renderDetail(feature: Spot['feature']) {
  const spot = createTestSpot({ feature });
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id } as never);
  render(<SpotDetailScreen />);
}

describe('Spot detail: skate stops', () => {
  it('shows the Stop Type row for a spot whose only feature data is skate stops', () => {
    // hasFeatureDetails ignored skate_stops, so the section was hidden unless some other feature field was set.
    renderDetail({ skate_stops: { is_stopped: true, stop_type: StopType.Knobs } });

    expect(screen.getByText('Stop Type')).toBeOnTheScreen();
    expect(screen.getByText('Knobs')).toBeOnTheScreen();
  });

  it('labels the stop description row "Stop Details", matching the Edit screen', () => {
    // (shape keeps the Feature section visible regardless of the hasFeatureDetails fix.)
    // Edit calls the field "Stop details"; the detail row said "Stop Info".
    renderDetail({ shape: 'DFD', skate_stops: { is_stopped: true, stop_description: 'Knobbed at kinks' } });

    expect(screen.getByText('Stop Details')).toBeOnTheScreen();
    expect(screen.getByText('Knobbed at kinks')).toBeOnTheScreen();
    expect(screen.queryByText('Stop Info')).toBeNull();
  });
});
