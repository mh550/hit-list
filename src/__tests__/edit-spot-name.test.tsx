import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSpotsStore } from '@/src/stores';
import { FeatureType } from '@/src/types';
import type { SpotUpdate } from '@/src/types';
import { createTestSpot } from './factories';

const mockUpdateSpot = jest.fn(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

describe('Edit spot: clearing the name', () => {
  it('saves name: null (not undefined) so the stored name is actually cleared', () => {
    // undefined means "leave the column alone" in updateSpot, so the old name came back after relaunch.
    const spot = createTestSpot({ name: 'Pier 57 rail' });
    useSpotsStore.setState({ spots: [spot] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });

    render(<EditSpotScreen />);
    fireEvent.changeText(screen.getByDisplayValue('Pier 57 rail'), '   ');
    fireEvent.press(screen.getByText('Save'));

    return waitFor(() => {
      expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
      const [id, updates] = mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate];
      expect(id).toBe(spot.id);
      expect(updates).toHaveProperty('name', null);
    });
  });

  it('Save writes the name, the three tags, notes and updated_at, and never the location', () => {
    // Adding or editing never moves the spot, and nothing from the removed model is written.
    const spot = createTestSpot({ name: 'Old', feature_types: [FeatureType.Rail], stopped: true, notes: 'keep' });
    useSpotsStore.setState({ spots: [spot] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
    mockUpdateSpot.mockClear();

    render(<EditSpotScreen />);
    fireEvent.changeText(screen.getByDisplayValue('Old'), 'New');
    fireEvent.press(screen.getByText('Save'));

    return waitFor(() => {
      expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
      const [, updates] = mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate];
      expect(Object.keys(updates).sort()).toEqual(
        ['feature_types', 'name', 'natural_speed', 'notes', 'stopped', 'updated_at'],
      );
      expect(updates).toMatchObject({ name: 'New', feature_types: [FeatureType.Rail], stopped: true, notes: 'keep' });
    });
  });
});
