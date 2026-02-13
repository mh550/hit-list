import { renderHook, act } from '@testing-library/react-native';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useSpotsStore } from '@/src/stores';
import { SpotStatus } from '@/src/types';
import { createTestSpot } from './factories';

const mockInsertSpot = jest.fn().mockResolvedValue(undefined);
const mockUpdateSpot = jest.fn().mockResolvedValue(undefined);
const mockSoftDeleteSpot = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/db', () => ({
  migrateDb: jest.fn().mockResolvedValue(undefined),
  getSpots: jest.fn().mockResolvedValue([]),
  getUserSettings: jest.fn().mockResolvedValue(null),
  insertSpot: (...args: any[]) => mockInsertSpot(...args),
  updateSpot: (...args: any[]) => mockUpdateSpot(...args),
  softDeleteSpot: (...args: any[]) => mockSoftDeleteSpot(...args),
  insertMedia: jest.fn().mockResolvedValue(undefined),
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
}));

describe('useSpotActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSpotsStore.setState({ spots: [] });
  });

  it('addSpot updates store immediately (optimistic)', () => {
    const { result } = renderHook(() => useSpotActions());
    const spot = createTestSpot({ id: 'new-spot' });

    act(() => {
      result.current.addSpot(spot);
    });

    expect(useSpotsStore.getState().spots).toHaveLength(1);
    expect(useSpotsStore.getState().spots[0].id).toBe('new-spot');
  });

  it('addSpot writes to DB', async () => {
    const { result } = renderHook(() => useSpotActions());
    const spot = createTestSpot({ id: 'new-spot' });

    await act(async () => {
      await result.current.addSpot(spot);
    });

    expect(mockInsertSpot).toHaveBeenCalledWith(expect.anything(), spot);
  });

  it('updateSpot updates store immediately', () => {
    const spot = createTestSpot({ id: 'existing-spot', name: 'Old Name' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    act(() => {
      result.current.updateSpot('existing-spot', { name: 'New Name' });
    });

    expect(useSpotsStore.getState().spots[0].name).toBe('New Name');
  });

  it('updateSpot writes to DB', async () => {
    const spot = createTestSpot({ id: 'existing-spot' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    await act(async () => {
      await result.current.updateSpot('existing-spot', { name: 'New Name' });
    });

    expect(mockUpdateSpot).toHaveBeenCalledWith(
      expect.anything(),
      'existing-spot',
      { name: 'New Name' },
    );
  });

  it('removeSpot removes from store immediately', () => {
    const spot = createTestSpot({ id: 'doomed-spot' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    act(() => {
      result.current.removeSpot('doomed-spot');
    });

    expect(useSpotsStore.getState().spots).toHaveLength(0);
  });

  it('removeSpot soft-deletes in DB', async () => {
    const spot = createTestSpot({ id: 'doomed-spot' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    await act(async () => {
      await result.current.removeSpot('doomed-spot');
    });

    expect(mockSoftDeleteSpot).toHaveBeenCalledWith(expect.anything(), 'doomed-spot');
  });

  it('DB write errors do not crash the app', async () => {
    mockInsertSpot.mockRejectedValueOnce(new Error('DB write failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useSpotActions());
    const spot = createTestSpot({ id: 'spot-with-error', status: SpotStatus.Draft });

    await act(async () => {
      await result.current.addSpot(spot);
    });

    // Store should still have the spot (optimistic update)
    expect(useSpotsStore.getState().spots).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
