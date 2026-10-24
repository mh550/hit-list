import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { insertSpot, insertMedia, getMediaForSpot, getAllMedia, deleteMedia } from '@/src/db';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
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

  it('keeps who uploaded a photo, and leaves it unset when nobody did', async () => {
    // Accounts are later work; the column is kept now so old photos can be attributed when they arrive.
    const spot = createTestSpot();
    await insertSpot(db, spot);
    const mine = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T11:00:00.000Z', uploaded_by: 'user-1' });
    const nobody = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T12:00:00.000Z' });
    await insertMedia(db, mine);
    await insertMedia(db, nobody);

    const [a, b] = await getMediaForSpot(db, spot.id);

    expect(a.uploaded_by).toBe('user-1');
    expect(b.uploaded_by).toBeUndefined();
    expect([a, b]).toEqual([mine, nobody]);
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

  it('deleteMedia makes the row disappear from getMediaForSpot, even when it was the only one', async () => {
    // Guard for remove-photo: after the delete the spot lists no such photo.
    const spot = createTestSpot();
    await insertSpot(db, spot);
    const only = createTestMedia({ spot_id: spot.id });
    await insertMedia(db, only);

    await deleteMedia(db, only.id);

    expect(await getMediaForSpot(db, spot.id)).toEqual([]);
  });

  it('getAllMedia returns every row, oldest first within each spot', async () => {
    const s1 = createTestSpot();
    const s2 = createTestSpot();
    await insertSpot(db, s1);
    await insertSpot(db, s2);
    const a2 = createTestMedia({ spot_id: s1.id, created_at: '2026-10-13T12:00:00.000Z' });
    const a1 = createTestMedia({ spot_id: s1.id, created_at: '2026-10-13T11:00:00.000Z' });
    const b1 = createTestMedia({ spot_id: s2.id, created_at: '2026-10-13T10:00:00.000Z' });
    for (const m of [a2, b1, a1]) await insertMedia(db, m);

    const all = await getAllMedia(db);

    expect(all).toHaveLength(3);
    expect(all.filter((m) => m.spot_id === s1.id)).toEqual([a1, a2]);
  });

  it('insertMedia writes updated_at = created_at and no deleted_at', async () => {
    const spot = createTestSpot();
    await insertSpot(db, spot);
    const m = createTestMedia({ spot_id: spot.id, created_at: '2026-10-13T11:00:00.000Z' });

    await insertMedia(db, m);

    expect(await db.getFirstAsync('SELECT updated_at, deleted_at FROM media WHERE id = ?', m.id)).toEqual({
      updated_at: '2026-10-13T11:00:00.000Z',
      deleted_at: null,
    });
  });

  it('deleteMedia is a soft delete: the row stays with deleted_at = updated_at, hidden from both readers', async () => {
    const spot = createTestSpot();
    await insertSpot(db, spot);
    const m = createTestMedia({ spot_id: spot.id });
    await insertMedia(db, m);

    await deleteMedia(db, m.id);

    const row = await db.getFirstAsync<{ deleted_at: string; updated_at: string }>(
      'SELECT deleted_at, updated_at FROM media WHERE id = ?',
      m.id,
    );
    expect(row?.deleted_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(row?.updated_at).toBe(row?.deleted_at);
    expect(await getMediaForSpot(db, spot.id)).toEqual([]);
    expect(await getAllMedia(db)).toEqual([]);
  });

  describe('outbox (migration 5 triggers)', () => {
    beforeEach(async () => {
      await adoptPhoneFor(db);
    });

    it("a photo takes its spot's owner; getMediaForSpot and getAllMedia return owner_id", async () => {
      const spot = createTestSpot({ owner_id: ME });
      const loose = createTestSpot();
      await insertSpot(db, spot);
      await insertSpot(db, loose);
      const m = createTestMedia({ spot_id: spot.id });
      const n = createTestMedia({ spot_id: loose.id });

      await insertMedia(db, m);
      await insertMedia(db, n);

      expect((await getMediaForSpot(db, spot.id))[0].owner_id).toBe(ME);
      expect((await getMediaForSpot(db, loose.id))[0].owner_id).toBeUndefined();
      expect((await getAllMedia(db)).map((x) => x.owner_id).sort()).toEqual([ME, undefined]);
    });

    it("inserting then removing a photo of an owned spot appends media upsert, then media delete", async () => {
      const spot = createTestSpot({ owner_id: ME });
      await insertSpot(db, spot);
      const m = createTestMedia({ spot_id: spot.id });

      await insertMedia(db, m);
      await deleteMedia(db, m.id);

      expect(await outboxOps(db)).toEqual([
        ['spot', spot.id, 'upsert'],
        ['media', m.id, 'upsert'],
        ['media', m.id, 'delete'],
      ]);
    });

    it('removing a photo twice appends one delete', async () => {
      const spot = createTestSpot({ owner_id: ME });
      await insertSpot(db, spot);
      const m = createTestMedia({ spot_id: spot.id });
      await insertMedia(db, m);

      await deleteMedia(db, m.id);
      await deleteMedia(db, m.id);

      expect((await outboxOps(db)).filter(([, , op]) => op === 'delete')).toHaveLength(1);
    });

    it('a photo of a phone-only spot appends nothing', async () => {
      const spot = createTestSpot();
      await insertSpot(db, spot);
      const m = createTestMedia({ spot_id: spot.id });

      await insertMedia(db, m);
      await deleteMedia(db, m.id);

      expect(await outboxOps(db)).toEqual([]);
    });

    it('a photo for a spot that does not exist is rejected and appends nothing', async () => {
      await expect(insertMedia(db, createTestMedia({ spot_id: 'missing' }))).rejects.toThrow();

      expect(await outboxOps(db)).toEqual([]);
    });
  });
});
