import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { createTestSpot } from './factories';

const mockRemoveSpot = jest.fn<Promise<void>, [string]>(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: jest.fn(), addSpot: jest.fn(), removeSpot: mockRemoveSpot }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ removePhotos: jest.fn(async (ids: string[]) => ids), savePhotos: jest.fn(async () => []) }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

const mockDismissAll = jest.fn();

function renderEdit(ownerId?: string) {
  const spot = createTestSpot({ id: 's1', name: 'Bridge rail', owner_id: ownerId });
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  return render(<EditSpotScreen />);
}

describe('Edit spot (S8-09 review)', () => {
  beforeEach(() => {
    mockRemoveSpot.mockReset();
    mockDismissAll.mockClear();
    jest.mocked(useRouter).mockReturnValue({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      dismissAll: mockDismissAll,
    } as never);
    useAuthStore.setState({ status: 'signed_in', userId: 'u-me', email: null, username: 'me', displayName: null });
  });
  afterEach(() => {
    useAuthStore.setState(SIGNED_OUT);
    jest.restoreAllMocks();
  });

  it("another rider's spot reached directly (a link) shows no editor: no Save, no Delete (D47)", () => {
    renderEdit('u-ana');
    expect(screen.getByText("This spot isn't yours to edit.")).toBeOnTheScreen();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Delete spot')).toBeNull();
    expect(screen.queryByDisplayValue('Bridge rail')).toBeNull();
  });

  it('the rider’s own spot still shows the editor', () => {
    renderEdit('u-me');
    expect(screen.getByDisplayValue('Bridge rail')).toBeOnTheScreen();
    expect(screen.queryByText("This spot isn't yours to edit.")).toBeNull();
  });

  it('a Delete that fails says so and stays on the screen (no unhandled rejection)', async () => {
    mockRemoveSpot.mockRejectedValueOnce(new Error('not your spot'));
    const alert = jest.spyOn(Alert, 'alert');
    renderEdit('u-me');

    await act(async () => fireEvent.press(screen.getByText('Delete spot')));
    const confirm = alert.mock.calls[0][2]?.find((b) => b.text === 'Delete');
    await act(async () => {
      await confirm?.onPress?.();
    });

    expect(mockRemoveSpot).toHaveBeenCalledWith('s1');
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith("Couldn't delete", 'Please try again.');
  });
});
