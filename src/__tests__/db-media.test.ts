import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, insertMedia, getMediaForSpot, deleteMedia } from '@/src/db';
import { createTestMedia, createTestSpot } from './factories';

describe('media against real SQLite', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    db = await createMigratedTestDb();
  });

  it("lists a spot's media oldest first, and only that spot's", async () => {
    const spot = createTestSpot();
    const other = createTestSpot();
    await insertSpot(db, spot);
    await insertSpot(db, other);
    const b = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T12:00:00.000Z' });
    const a = createTestMedia({
      spot_id: spot.id,
      created_at: '2026-10-13T11:00:00.000Z',
      location: { latitude: 47.6, longitude: -122.3 },
      captured_at: '2026-10-13T10:59:00',
    });
    await insertMedia(db, b);
    await insertMedia(db, a);
    await insertMedia(db, createTestMedia({ spot_id: other.id }));

    expect(await getMediaForSpot(db, spot.id)).toEqual([a, b]);
  });

  it('deleteMedia removes only that row', async () => {
    const spot = createTestSpot();
    await insertSpot(db, spot);
    const keep = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T11:00:00.000Z' });
    const drop = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T12:00:00.000Z' });
    await insertMedia(db, keep);
    await insertMedia(db, drop);

    await deleteMedia(db, drop.id);

    expect(await getMediaForSpot(db, spot.id)).toEqual([keep]);
  });
});
