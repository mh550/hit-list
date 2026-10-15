import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpot, getSpots, updateSpot, softDeleteSpot } from '@/src/db';
import { FeatureType, SpotStatus, StopType } from '@/src/types';
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

  it('partial updateSpot leaves the other JSON columns intact', async () => {
    const s = createTestSpot({
      feature: { type: FeatureType.Rail },
      in_run: { natural_speed: 3, setup_options: [] },
      landing: { difficulty: 2 },
      metadata: { notes: 'kinked' },
    });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { name: 'Kinked rail', status: SpotStatus.Complete });

    expect(await getSpot(db, s.id)).toMatchObject({
      name: 'Kinked rail',
      status: SpotStatus.Complete,
      feature: s.feature,
      in_run: s.in_run,
      landing: s.landing,
      metadata: s.metadata,
    });
  });

  it('updateSpot with skate_stops: undefined removes the stops and leaves the other feature fields', async () => {
    // Guard: turning skate stops off in Edit must really drop them from the stored feature JSON.
    const feature = {
      type: FeatureType.Rail,
      shape: 'DFD',
      difficulty: 3,
      skate_stops: { is_stopped: true, stop_type: StopType.Knobs, stop_description: 'x', removable: true },
    };
    const s = createTestSpot({ feature });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { feature: { ...feature, skate_stops: undefined } });

    const stored = await getSpot(db, s.id);
    expect(stored?.feature.skate_stops).toBeUndefined();
    expect(stored?.feature).toMatchObject({ type: FeatureType.Rail, shape: 'DFD', difficulty: 3 });
  });

  it('round-trips quotes, dashes and emoji in text fields', async () => {
    const name = `O'Brien's "kink" rail — Pier 57 🛹`;
    const s = createTestSpot({ name, metadata: { notes: `it's "fine"; DROP TABLE spots; --` } });

    await insertSpot(db, s);

    expect(await getSpot(db, s.id)).toEqual(s);
  });

  it('updateSpot with name: null clears the stored name and leaves other columns alone', async () => {
    // Clearing the name in Edit must persist; undefined means "leave the column alone", so only null clears it.
    const s = createTestSpot({
      name: 'Pier 57 rail',
      generated_name: 'Seattle',
      status: SpotStatus.Complete,
      feature: { type: FeatureType.Rail },
      metadata: { notes: 'kinked' },
    });
    await insertSpot(db, s);

    await updateSpot(db, s.id, { name: null });

    const { name, updated_at: _updatedAt, ...rest } = s; // updateSpot rewrites updated_at itself
    expect(name).toBe('Pier 57 rail');
    const read = await getSpot(db, s.id);
    expect(read?.name ?? null).toBeNull();
    expect(read).toMatchObject(rest);
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
