import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpot, getSpots, getSpotLegacy, updateSpot, softDeleteSpot } from '@/src/db';
import { FeatureType } from '@/src/types';
import { createTestSpot } from './factories';

describe('spots against real SQLite', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = await createMigratedTestDb();
  });

  it('migrateDb → insertSpot → getSpots round-trips a spot', async () => {
    const spot = createTestSpot({ name: 'Ledge at Pier 57' });

    await insertSpot(db, spot);

    expect(await getSpots(db)).toEqual([spot]);
  });

  it('lists newest first and excludes soft-deleted spots', async () => {
    const older = createTestSpot({ created_at: '2026-10-13T10:00:00.000Z' });
    const newer = createTestSpot({ created_at: '2026-10-13T12:00:00.000Z' });
    const gone = createTestSpot({ created_at: '2026-10-13T11:00:00.000Z' });
    for (const s of [older, newer, gone]) await insertSpot(db, s);
    await softDeleteSpot(db, gone.id);

    expect((await getSpots(db)).map((s) => s.id)).toEqual([newer.id, older.id]);
  });

  it('getSpot returns null for a soft-deleted spot', async () => {
    const s = createTestSpot();
    await insertSpot(db, s);
    await softDeleteSpot(db, s.id);

    expect(await getSpot(db, s.id)).toBeNull();
  });

  it('round-trips feature_types, stopped, natural_speed and notes', async () => {
    const s = createTestSpot({
      feature_types: [FeatureType.Rail, FeatureType.Ledge],
      stopped: true,
      natural_speed: 0, // None is a real rating: it must not come back as unset
      notes: 'kinked, wax it',
    });

    await insertSpot(db, s);

    const read = await getSpot(db, s.id);
    expect(read).toEqual(s);
    expect(read?.natural_speed).toBe(0);
  });

  it('a spot saved without tags reads back untagged: [] / false / unset', async () => {
    const s = createTestSpot();
    await insertSpot(db, s);

    const read = await getSpot(db, s.id);
    expect(read).toMatchObject({ feature_types: [], stopped: false });
    expect(read?.natural_speed).toBeUndefined();
    expect(read?.notes).toBeUndefined();
  });

  it('partial updateSpot leaves the other columns intact', async () => {
    const s = createTestSpot({
      feature_types: [FeatureType.Rail],
      stopped: true,
      natural_speed: 2,
      notes: 'kinked',
    });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { name: 'Kinked rail' });

    expect(await getSpot(db, s.id)).toMatchObject({
      name: 'Kinked rail',
      feature_types: [FeatureType.Rail],
      stopped: true,
      natural_speed: 2,
      notes: 'kinked',
    });
  });

  it('updateSpot writes feature_types, stopped, natural_speed 0 and notes', async () => {
    const s = createTestSpot({ feature_types: [FeatureType.Rail], stopped: true, natural_speed: 4 });
    await insertSpot(db, s);

    await updateSpot(db, s.id, {
      feature_types: [FeatureType.Bank, FeatureType.Hip],
      stopped: false,
      natural_speed: 0,
      notes: 'icy',
    });

    expect(await getSpot(db, s.id)).toMatchObject({
      feature_types: [FeatureType.Bank, FeatureType.Hip],
      stopped: false,
      natural_speed: 0,
      notes: 'icy',
    });
  });

  it('updateSpot with natural_speed: null and notes: null clears them', async () => {
    const s = createTestSpot({ natural_speed: 3, notes: 'hello', feature_types: [FeatureType.Gap] });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { natural_speed: null, notes: null });

    const read = await getSpot(db, s.id);
    expect(read?.natural_speed).toBeUndefined();
    expect(read?.notes).toBeUndefined();
    expect(read?.feature_types).toEqual([FeatureType.Gap]);
    expect(
      await db.getFirstAsync('SELECT natural_speed, notes FROM spots WHERE id = ?', s.id),
    ).toEqual({ natural_speed: null, notes: null });
  });

  it('round-trips quotes, dashes and emoji in text fields', async () => {
    const name = `O'Brien's "kink" rail — Pier 57 🛹`;
    const s = createTestSpot({ name, notes: `it's "fine"; DROP TABLE spots; --` });

    await insertSpot(db, s);

    expect(await getSpot(db, s.id)).toEqual(s);
  });

  it('updateSpot with name: null clears the stored name and leaves other columns alone', async () => {
    // Clearing the name in Edit must persist; undefined means "leave the column alone", so only null clears it.
    const s = createTestSpot({
      name: 'Pier 57 rail',
      generated_name: 'Seattle',
      feature_types: [FeatureType.Rail],
      notes: 'kinked',
    });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { name: null });

    const { name, updated_at: _updatedAt, ...rest } = s; // updateSpot rewrites updated_at itself
    expect(name).toBe('Pier 57 rail');
    const read = await getSpot(db, s.id);
    expect(read?.name ?? null).toBeNull();
    expect(read).toMatchObject(rest);
  });

  describe('getSpotLegacy', () => {
    it('returns null for a spot saved since migration 3', async () => {
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);

      expect(await getSpotLegacy(db, s.id)).toBeNull();
    });

    it('returns null for an unknown id', async () => {
      expect(await getSpotLegacy(db, 'no-such-spot')).toBeNull();
    });

    it('returns the archived object for a migrated spot, which getSpot never carries', async () => {
      // Migration 3 writes legacy_json (db-migrate.test.ts runs it on v2 rows); here the column is set directly.
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);
      await db.runAsync(
        'UPDATE spots SET legacy_json = ? WHERE id = ?',
        '{"material":"steel","landing_surface":"snow_built"}',
        s.id,
      );

      expect(await getSpotLegacy(db, s.id)).toEqual({ material: 'steel', landing_surface: 'snow_built' });
      expect(await getSpot(db, s.id)).toEqual(s);
    });

    it('rejects when the archive is not JSON, so the detail screen can warn and skip Older details', async () => {
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);
      await db.runAsync('UPDATE spots SET legacy_json = ? WHERE id = ?', '{"material":', s.id);

      await expect(getSpotLegacy(db, s.id)).rejects.toThrow(SyntaxError);
    });

    it.each(['"oops"', '[1,2]', '3', 'null'])('returns null for an archive that is JSON but not an object (%s)', async (json) => {
      const s = createTestSpot({ feature_types: [FeatureType.Rail] });
      await insertSpot(db, s);
      await db.runAsync('UPDATE spots SET legacy_json = ? WHERE id = ?', json, s.id);

      expect(await getSpotLegacy(db, s.id)).toBeNull();
    });
  });

  describe('timestamps are ISO 8601 UTC', () => {
    const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const NOW = new Date('2026-10-15T12:34:56.789Z');

    // Fake only Date so promises, timers and node:sqlite keep working; datetime('now') ignores it (real clock).
    beforeEach(() => {
      jest.useFakeTimers({
        now: NOW,
        doNotFake: [
          'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
          'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
          'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        ],
      });
    });
    afterEach(() => jest.useRealTimers());

    it('updateSpot stores the updated_at the caller passes', async () => {
      // The Edit screen stamps updated_at; the DB must keep that value, not replace it with its own clock.
      const s = createTestSpot();
      await insertSpot(db, s);

      await updateSpot(db, s.id, { name: 'x', updated_at: '2026-10-15T12:00:00.000Z' });

      expect((await getSpot(db, s.id))?.updated_at).toBe('2026-10-15T12:00:00.000Z');
    });

    it('updateSpot without updated_at stamps now as ISO 8601 UTC', async () => {
      // datetime('now') gives "2026-10-15 12:34:56" (no T, no Z), which Hermes may misparse; use toISOString().
      const s = createTestSpot();
      await insertSpot(db, s);

      await updateSpot(db, s.id, { name: 'x' });

      const stored = (await getSpot(db, s.id))?.updated_at ?? '';
      expect(stored).toMatch(ISO_Z);
      expect(stored).toBe(NOW.toISOString()); // Date is faked, so exact; the real-clock datetime('now') cannot match
    });

    it('softDeleteSpot writes deleted_at and updated_at as the same ISO string', async () => {
      // Both columns must be ISO 8601 UTC like every other timestamp, and agree with each other.
      const s = createTestSpot();
      await insertSpot(db, s);

      await softDeleteSpot(db, s.id);

      const row = await db.getFirstAsync<{ deleted_at: string; updated_at: string }>(
        'SELECT deleted_at, updated_at FROM spots WHERE id = ?',
        s.id,
      );
      expect(row?.deleted_at).toMatch(ISO_Z);
      expect(row?.updated_at).toBe(row?.deleted_at);
      expect(row?.deleted_at).toBe(NOW.toISOString());
    });

    it('softDeleteSpot with an explicit at writes it to both columns', async () => {
      // The hook stamps one time and shares it with the store, so the DB must use the caller's value.
      const s = createTestSpot();
      await insertSpot(db, s);
      const at = '2026-10-15T09:00:00.000Z';

      await softDeleteSpot(db, s.id, at);

      const row = await db.getFirstAsync<{ deleted_at: string; updated_at: string }>(
        'SELECT deleted_at, updated_at FROM spots WHERE id = ?',
        s.id,
      );
      expect(row).toEqual({ deleted_at: at, updated_at: at });
    });
  });
});
