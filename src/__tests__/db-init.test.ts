import { renderHook, act, waitFor } from '@testing-library/react-native';
import { reverseGeocodeAsync } from 'expo-location';
import { useDbInit } from '@/src/hooks/use-db-init';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useMediaStore } from '@/src/stores/media-store';
import { useHitListsStore } from '@/src/stores/hit-lists-store';
import { UnitSystem } from '@/src/types';
import { createTestHitList, createTestMedia, createTestSpot } from './factories';

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
const mockGetHitLists = jest.fn();
const mockGetListMemberships = jest.fn();

jest.mock('@/src/db', () => ({
  migrateDb: (...args: any[]) => mockMigrateDb(...args),
  getSpots: (...args: any[]) => mockGetSpots(...args),
  getUserSettings: (...args: any[]) => mockGetUserSettings(...args),
  getAllMedia: (...args: any[]) => mockGetAllMedia(...args),
  getHitLists: (...args: any[]) => mockGetHitLists(...args),
  getListMemberships: (...args: any[]) => mockGetListMemberships(...args),
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
    mockGetHitLists.mockResolvedValue([]);
    mockGetListMemberships.mockResolvedValue({});
    useHitListsStore.setState({ lists: [], membershipBySpot: {} });
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
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
    const spot = createTestSpot({ id: 'db-spot-1', name: 'DB Spot' });
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

  it('still loads spots, media and settings when migrateDb throws', async () => {
    // A failed upgrade leaves the DB at the last good version; whatever still loads is loaded (DBInitializer then
    // blocks the app, D28).
    mockMigrateDb.mockRejectedValueOnce(new Error('migration 2 failed'));
    const spot = createTestSpot({ name: 'still here' });
    const m = createTestMedia({ spot_id: spot.id });
    mockGetSpots.mockResolvedValue([spot]);
    mockGetAllMedia.mockResolvedValue([m]);
    mockGetUserSettings.mockResolvedValue({ units: UnitSystem.Metric, batch_import_radius: 50 });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await flushInit();

    expect(result.current.isReady).toBe(true);
    expect(useSpotsStore.getState().spots).toEqual([spot]);
    expect(useMediaStore.getState().mediaBySpot).toEqual({ [spot.id]: [m] });
    expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('migrat'), expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('still marks ready when the load itself fails', async () => {
    // The migration is handled above; this is the second catch: a failing getSpots must not strand the splash screen.
    mockGetSpots.mockRejectedValueOnce(new Error('DB error'));
    mockGetUserSettings.mockResolvedValue(null);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await flushInit();
    expect(result.current.isReady).toBe(true);

    expect(useSpotsStore.getState().spots).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('initialize'), expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('loads media and settings even when getSpots fails', async () => {
    // Below version 3 getSpots throws on the missing columns; default settings would then be saved over the real ones.
    mockGetSpots.mockRejectedValueOnce(new Error('no such column: feature_types_json'));
    const m = createTestMedia({ spot_id: 'spot-1' });
    mockGetAllMedia.mockResolvedValue([m]);
    mockGetUserSettings.mockResolvedValue({ units: UnitSystem.Metric, batch_import_radius: 120 });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() => useDbInit());
    await flushInit();

    expect(useMediaStore.getState().mediaBySpot).toEqual({ 'spot-1': [m] });
    expect(useSettingsStore.getState().batch_import_radius).toBe(120);
    consoleSpy.mockRestore();
  });

  it('reports upgradeFailed only when migrateDb throws (D28)', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);
    const ok = renderHook(() => useDbInit());
    await flushInit();
    expect(ok.result.current.upgradeFailed).toBe(false);

    mockMigrateDb.mockRejectedValueOnce(new Error('migration 3 failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failed = renderHook(() => useDbInit());
    await flushInit();
    expect(failed.result.current).toEqual({ isReady: true, upgradeFailed: true });
    consoleSpy.mockRestore();
  });

  it('loads hit lists and memberships into the hit-lists store', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);
    const list = createTestHitList({ id: 'L1' });
    mockGetHitLists.mockResolvedValue([list]);
    mockGetListMemberships.mockResolvedValue({ s1: ['L1'] });

    renderHook(() => useDbInit());
    await flushInit();

    expect(mockGetHitLists).toHaveBeenCalledWith(mockDb);
    expect(useHitListsStore.getState().lists).toEqual([list]);
    expect(useHitListsStore.getState().membershipBySpot).toEqual({ s1: ['L1'] });
  });

  it('still becomes ready, with memberships and settings loaded, when getHitLists throws', async () => {
    const spot = createTestSpot();
    mockGetSpots.mockResolvedValue([spot]);
    mockGetUserSettings.mockResolvedValue({ units: UnitSystem.Metric, batch_import_radius: 80 });
    mockGetHitLists.mockRejectedValueOnce(new Error('no such table: hit_lists'));
    mockGetListMemberships.mockResolvedValue({ [spot.id]: ['L1'] });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await flushInit();

    expect(result.current.isReady).toBe(true);
    expect(useSpotsStore.getState().spots.map((s) => s.id)).toEqual([spot.id]);
    expect(useHitListsStore.getState().lists).toEqual([]);
    expect(useHitListsStore.getState().membershipBySpot).toEqual({ [spot.id]: ['L1'] });
    expect(useSettingsStore.getState().batch_import_radius).toBe(80);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useDbInit] Failed to initialize database (hit lists):',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('still becomes ready when getListMemberships throws', async () => {
    mockGetSpots.mockResolvedValue([]);
    mockGetUserSettings.mockResolvedValue(null);
    const list = createTestHitList();
    mockGetHitLists.mockResolvedValue([list]);
    mockGetListMemberships.mockRejectedValueOnce(new Error('disk I/O error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await flushInit();

    expect(result.current.isReady).toBe(true);
    expect(useHitListsStore.getState().lists).toEqual([list]);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useDbInit] Failed to initialize database (memberships):',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
