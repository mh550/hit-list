import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { createTestSpot } from './factories';

// Save's last await is updateSpot; a test holds it open to act while the save is running.
let finishUpdate: () => void = () => {};
const mockUpdateSpot = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      finishUpdate = resolve;
    }),
);
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ removePhotos: jest.fn(async (ids: string[]) => ids), savePhotos: jest.fn(async () => []) }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

const mockBack = jest.fn();

function renderEdit() {
  const spot = createTestSpot({ id: 's1', name: 'Bridge rail' });
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  return render(<EditSpotScreen />);
}

/** The options the screen hands to its Stack.Screen (the router mock renders it as a host element). */
const screenOptions = () =>
  (screen.UNSAFE_root.findAll((n) => (n.type as unknown) === 'Stack.Screen')[0]?.props.options ?? {}) as {
    gestureEnabled?: boolean;
  };

describe('Edit spot: leaving while Save runs', () => {
  beforeEach(() => {
    mockUpdateSpot.mockClear();
    mockBack.mockClear();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back: mockBack, replace: jest.fn(), dismissAll: jest.fn() } as never);
  });

  it('cannot be swiped away while saving', async () => {
    // The sheet is a formSheet: a swipe down during Save would pop it, and Save's own back() would then pop detail.
    renderEdit();
    expect(screenOptions().gestureEnabled).not.toBe(false);

    fireEvent.press(screen.getByText('Save'));
    await act(async () => {});
    expect(screenOptions().gestureEnabled).toBe(false);
  });

  it('does not go back a second time when the sheet is already gone by the time Save finishes', async () => {
    // Android back (or a dismissal the gesture block missed) unmounts the sheet; back() then would pop the detail screen.
    const { unmount } = renderEdit();

    fireEvent.press(screen.getByText('Save'));
    await act(async () => {});
    expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => finishUpdate());

    expect(mockBack).not.toHaveBeenCalled();
  });

  it('still goes back once when the sheet is open as Save finishes', async () => {
    renderEdit();

    fireEvent.press(screen.getByText('Save'));
    await act(async () => {});
    await act(async () => finishUpdate());

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
