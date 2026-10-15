import { createTestDb } from './helpers/node-sqlite-db';
import { migrateDb, insertSpot, getSpots } from '@/src/db';
import { createTestSpot } from './factories';

describe('spots against real SQLite', () => {
  it('migrateDb → insertSpot → getSpots round-trips a spot', async () => {
    const db = createTestDb();
    await migrateDb(db);
    const spot = createTestSpot({ name: 'Ledge at Pier 57' });

    await insertSpot(db, spot);

    expect(await getSpots(db)).toEqual([spot]);
  });
});
