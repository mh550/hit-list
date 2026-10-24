import type { SQLiteDatabase } from 'expo-sqlite';
import { renderHook, act } from '@testing-library/react-native';
import { createTestDb } from './helpers/node-sqlite-db';
import { saveUserSettings } from '@/src/db';
import { migrateDb, MIGRATIONS, getSchemaVersion, SPOT_V2_COLUMNS as V2 } from '@/src/db/schema';
import { useDbInit } from '@/src/hooks/use-db-init';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useMediaStore } from '@/src/stores/media-store';
import { UnitSystem } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

// db-init.test.ts mocks '@/src/db'; here the hook runs against a real v2 DB whose migration 3 throws, as a phone would.
let mockDb: SQLiteDatabase;
jest.mock('expo-sqlite', () => ({
  ...jest.requireActual('expo-sqlite'),
  useSQLiteContext: () => mockDb,
}));

const flushInit = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)));

describe('useDbInit when migration 3 throws on a real v2 DB', () => {
  beforeEach(() => {
    useSpotsStore.setState({ spots: [] });
    useMediaStore.setState({ mediaBySpot: {} });
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
  });

  it('reports the failed upgrade, still loads settings, and leaves the v2 spot on disk', async () => {
    const db = createTestDb();
    await migrateDb(db, MIGRATIONS.slice(0, 2));
    const spot = createTestSpot({ name: 'kept' });
    await db.runAsync(
      `INSERT INTO spots (id, name, latitude, longitude, created_at, updated_at, ${V2.status}, ${V2.feature})
       VALUES (?, ?, ?, ?, ?, ?, 'draft', '{"type":"rail"}')`,
      spot.id,
      spot.name ?? null,
      spot.location.latitude,
      spot.location.longitude,
      spot.created_at,
      spot.updated_at,
    );
    const photo = createTestMedia({ spot_id: spot.id });
    await db.runAsync(
      // the version 2 row shape: insertMedia writes today's columns
      'INSERT INTO media (id, spot_id, file_path, created_at) VALUES (?, ?, ?, ?)',
      photo.id,
      photo.spot_id,
      photo.file_path,
      photo.created_at,
    );
    await saveUserSettings(db, { units: UnitSystem.Metric, batch_import_radius: 120 });
    await db.execAsync('CREATE TABLE spots_new (x)'); // migration 3's rebuild then fails
    mockDb = db;
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDbInit());
    await flushInit();

    expect(result.current).toEqual({ isReady: true, upgradeFailed: true }); // DBInitializer blocks the app (D28)
    expect(useSpotsStore.getState().spots).toEqual([]); // below v3 getSpots can't read the old columns
    // Below v5 getAllMedia can't read either (owner_id, deleted_at); the photo row stays on disk for the retry.
    expect(useMediaStore.getState().mediaBySpot).toEqual({});
    expect(await db.getAllAsync('SELECT id FROM media')).toEqual([{ id: photo.id }]);
    expect(useSettingsStore.getState()).toMatchObject({ units: UnitSystem.Metric, batch_import_radius: 120 });
    expect(await getSchemaVersion(db)).toBe(2);
    expect(await db.getAllAsync(`SELECT id, name, ${V2.feature} AS feature FROM spots`)).toEqual([
      { id: spot.id, name: 'kept', feature: '{"type":"rail"}' },
    ]);
    consoleSpy.mockRestore();
  });
});
