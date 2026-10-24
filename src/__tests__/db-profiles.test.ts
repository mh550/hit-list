import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { adoptPhoneFor } from './helpers/outbox';
import { clearProfiles, getProfiles, upsertProfiles } from '@/src/db/profiles';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = await createMigratedTestDb();
});

describe('the local profiles mirror (D72)', () => {
  it('upserts two profiles and getProfiles returns both by id', async () => {
    await upsertProfiles(db, [
      { id: 'p-ana', username: 'ana', display_name: 'Ana B' },
      { id: 'p-ben', username: 'ben', display_name: null },
    ]);

    expect(await getProfiles(db, ['p-ana', 'p-ben', 'p-unknown'])).toEqual({
      'p-ana': { id: 'p-ana', username: 'ana', display_name: 'Ana B' },
      'p-ben': { id: 'p-ben', username: 'ben', display_name: null },
    });
  });

  it('upserting again updates the row in place (a rename, a new display name), no duplicate', async () => {
    await upsertProfiles(db, [{ id: 'p-ana', username: 'ana', display_name: 'Ana B' }]);

    await upsertProfiles(db, [{ id: 'p-ana', username: 'ana_b', display_name: 'Ana Banana' }]);

    expect(await db.getAllAsync('SELECT * FROM profiles')).toEqual([
      { id: 'p-ana', username: 'ana_b', display_name: 'Ana Banana' },
    ]);
  });

  it('a NULL username never erases a known one', async () => {
    await upsertProfiles(db, [{ id: 'p-ana', username: 'ana', display_name: 'Ana B' }]);

    await upsertProfiles(db, [{ id: 'p-ana', username: null, display_name: 'Ana B' }]);

    expect((await getProfiles(db, ['p-ana']))['p-ana'].username).toBe('ana');
  });

  it('getProfiles([]) is {} and upsertProfiles([]) writes nothing', async () => {
    await upsertProfiles(db, []);

    expect(await getProfiles(db, [])).toEqual({});
    expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM profiles')).toEqual({ n: 0 });
  });

  it('clearProfiles empties the mirror', async () => {
    await upsertProfiles(db, [{ id: 'p-ana', username: 'ana', display_name: null }]);

    await clearProfiles(db);

    expect(await getProfiles(db, ['p-ana'])).toEqual({});
  });

  it('never queues an outbox row, also on an adopted phone', async () => {
    await adoptPhoneFor(db);

    await upsertProfiles(db, [{ id: 'p-ana', username: 'ana', display_name: null }]);

    expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM sync_outbox')).toEqual({ n: 0 });
  });
});
