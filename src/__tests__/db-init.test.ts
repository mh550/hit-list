import { renderHook, act, waitFor } from '@testing-library/react-native';
import { reverseGeocodeAsync } from 'expo-location';
import { useDbInit } from '@/src/hooks/use-db-init';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useMediaStore } from '@/src/stores/media-store';
import { SpotStatus, UnitSystem } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

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
const mockGetAllMedia = jest.fn();
const mockMigrateDb = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/db', () => ({
  migrateDb: (...args: any[]) => mockMigrateDb(...args),
  getSpots: (...args: any[]) => mockGetSpots(...args),
  getUserSettings: (...args: any[]) => mockGetUserSettings(...args),
  getAllMedia: (...args: any[]) => mockGetAllMedia(...args),
  insertSpot: jest.fn().mockResolvedValue(undefined),
  updateSpot: jest.fn().mockResolvedValue(undefined),
  softDeleteSpot: jest.fn().mockResolvedValue(undefined),
  insertMedia: jest.fn().mockResolvedValue(undefined),
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
}));

/** One macrotask drains the whole mocked init chain; doing it inside act() keeps React quiet. */
const flushInit = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)));

describe('useDbInit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSpotsStore.setState({ spots: [] });
    useMediaStore.setState({ mediaBySpot: {} });
    mockGetAllMedia.mockResolvedValue([]);
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
      gear: [],
    });
  });

  it('calls migrateDb on mount', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);

    renderHook(() => useDbInit());
    await flushInit();

    expect(mockMigrateDb).toHaveBeenCalledWith(mockDb);
  });

  it('loads spots from DB into store', async () => {
    const spot = createTestSpot({ id: 'db-spot-1', name: 'DB Spot', status: SpotStatus.Complete });
    mockGetSpots.mockResolvedValue([spot]);
    mockGetUserSettings.mockResolvedValue(null);

    renderHook(() => useDbInit());
    await flushInit();
    expect(useSpotsStore.getState().spots).toHaveLength(1);

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
    await flushInit();
    expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);

    expect(useSettingsStore.getState().batch_import_radius).toBe(100);
  });

  it('starts not ready and becomes ready after hydration', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);

    const { result } = renderHook(() => useDbInit());
    expect(result.current.isReady).toBe(false);
    await flushInit();

    expect(result.current.isReady).toBe(true);
  });

  it('loads media into the media store', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);
    const m = createTestMedia({ spot_id: 's1' });
    mockGetAllMedia.mockResolvedValue([m]);

    renderHook(() => useDbInit());
    await flushInit();

    expect(useMediaStore.getState().mediaBySpot).toEqual({ s1: [m] });
  });

  it('backfills towns after launch without delaying ready', async () => {
    const spots = Array.from({ length: 12 }, () => createTestSpot());
    mockGetSpots.mockResolvedValue(spots);
    mockGetUserSettings.mockResolvedValue(null);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    jest.mocked(reverseGeocodeAsync).mockImplementation(async () => {
      await gate;
      return [{ city: 'Seattle' }] as never;
    });

    const { result } = renderHook(() => useDbInit());
    await flushInit();

    expect(result.current.isReady).toBe(true); // ready while the geocoder is still waiting
    release();
    await waitFor(() => expect(reverseGeocodeAsync).toHaveBeenCalledTimes(10));
    await waitFor(() =>
      expect(useSpotsStore.getState().spots.filter((s) => s.generated_name === 'Seattle')).toHaveLength(10),
    );
  });

  it('handles DB errors gracefully — still marks ready', async () => {
    mockMigrateDb.mockRejectedValueOnce(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await flushInit();
    expect(result.current.isReady).toBe(true);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
