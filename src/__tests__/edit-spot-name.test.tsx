import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSpotsStore } from '@/src/stores';
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
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back: jest.fn(), replace: jest.fn() } as never);

    render(<EditSpotScreen />);
    fireEvent.changeText(screen.getByDisplayValue('Pier 57 rail'), '   ');
    fireEvent.press(screen.getByText('Save'));

    return waitFor(() => {
      expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
      const [id, updates] = mockUpdateSpot.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(id).toBe(spot.id);
      expect(updates).toHaveProperty('name', null);
    });
  });
});
