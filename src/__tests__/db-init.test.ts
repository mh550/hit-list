import { renderHook, waitFor } from '@testing-library/react-native';
import { useDbInit } from '@/src/hooks/use-db-init';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { SpotStatus, UnitSystem } from '@/src/types';
import { createTestSpot } from './factories';

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
};

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => mockDb,
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockGetSpots = jest.fn();
const mockGetUserSettings = jest.fn();
const mockMigrateDb = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/db', () => ({
  migrateDb: (...args: any[]) => mockMigrateDb(...args),
  getSpots: (...args: any[]) => mockGetSpots(...args),
  getUserSettings: (...args: any[]) => mockGetUserSettings(...args),
  insertSpot: jest.fn().mockResolvedValue(undefined),
  updateSpot: jest.fn().mockResolvedValue(undefined),
  softDeleteSpot: jest.fn().mockResolvedValue(undefined),
  insertMedia: jest.fn().mockResolvedValue(undefined),
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
}));

describe('useDbInit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSpotsStore.setState({ spots: [] });
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
      gear: [],
    });
  });

  it('starts as not ready', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);
    const { result } = renderHook(() => useDbInit());
    expect(result.current.isReady).toBe(false);
    // Let the async init settle inside act() so the state update is not reported as unwrapped.
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('calls migrateDb on mount', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);

    const { result } = renderHook(() => useDbInit());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(mockMigrateDb).toHaveBeenCalledWith(mockDb);
  });

  it('loads spots from DB into store', async () => {
    const spot = createTestSpot({ id: 'db-spot-1', name: 'DB Spot', status: SpotStatus.Complete });
    mockGetSpots.mockResolvedValue([spot]);
    mockGetUserSettings.mockResolvedValue(null);

    renderHook(() => useDbInit());
    await waitFor(() => {
      expect(useSpotsStore.getState().spots).toHaveLength(1);
    });

    expect(useSpotsStore.getState().spots[0].id).toBe('db-spot-1');
  });

  it('loads settings from DB into store', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue({
      units: UnitSystem.Metric,
      batch_import_radius: 100,
      gear: [],
    });

    renderHook(() => useDbInit());
    await waitFor(() => {
      expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);
    });

    expect(useSettingsStore.getState().batch_import_radius).toBe(100);
  });

  it('sets isReady to true after hydration', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);

    const { result } = renderHook(() => useDbInit());
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  it('handles DB errors gracefully — still marks ready', async () => {
    mockMigrateDb.mockRejectedValueOnce(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
