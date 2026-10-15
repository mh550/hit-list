import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, getSpot, getSpots, updateSpot, softDeleteSpot } from '@/src/db';
import { FeatureType, SpotStatus } from '@/src/types';
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

  it('round-trips quotes, dashes and emoji in text fields', async () => {
    const name = `O'Brien's "kink" rail — Pier 57 🛹`;
    const s = createTestSpot({ name, metadata: { notes: `it's "fine"; DROP TABLE spots; --` } });

    await insertSpot(db, s);

    expect(await getSpot(db, s.id)).toEqual(s);
  });

  it('updateSpot with name: null clears the stored name and leaves other columns alone', async () => {
    // Clearing the name in Edit must persist; today undefined/skip keeps the old name after relaunch.
    const s = createTestSpot({
      name: 'Pier 57 rail',
      generated_name: 'Seattle',
      status: SpotStatus.Complete,
      feature: { type: FeatureType.Rail },
      metadata: { notes: 'kinked' },
    });
    await insertSpot(db, s);

    // Cast: the type forbids null today; the fix is expected to allow it.
    await updateSpot(db, s.id, { name: null } as unknown as Parameters<typeof updateSpot>[2]);

    const { name, updated_at: _updatedAt, ...rest } = s; // updateSpot rewrites updated_at itself
    expect(name).toBe('Pier 57 rail');
    const read = await getSpot(db, s.id);
    expect(read?.name ?? null).toBeNull();
    expect(read).toMatchObject(rest);
    expect((await getSpots(db))[0].name ?? null).toBeNull();
  });
});
