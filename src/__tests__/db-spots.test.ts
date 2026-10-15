import type { SQLiteDatabase } from 'expo-sqlite';
import { createTestDb } from './helpers/node-sqlite-db';
import { migrateDb, insertSpot, getSpot, getSpots, updateSpot, softDeleteSpot } from '@/src/db';
import { FeatureType, SpotStatus } from '@/src/types';
import { createTestSpot } from './factories';

describe('spots against real SQLite', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = createTestDb();
    await migrateDb(db);
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

  it('round-trips quotes, dashes and emoji in text fields', async () => {
    const name = `O'Brien's "kink" rail — Pier 57 🛹`;
    const s = createTestSpot({ name, metadata: { notes: `it's "fine"; DROP TABLE spots; --` } });

    await insertSpot(db, s);

    expect(await getSpot(db, s.id)).toEqual(s);
  });
});
