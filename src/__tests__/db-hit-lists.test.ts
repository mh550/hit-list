import type { SQLiteDatabase } from 'expo-sqlite';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import {
  insertSpot,
  getSpots,
  softDeleteSpot,
  insertHitList,
  getHitLists,
  updateHitList,
  softDeleteHitList,
  addSpotsToList,
  removeSpotFromList,
  getListMemberships,
} from '@/src/db';
import { FeatureType, type HitList, type Spot } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';

const memberRows = (db: SQLiteDatabase) =>
  db.getAllAsync<{ list_id: string; spot_id: string; added_at: string }>(
    'SELECT list_id, spot_id, added_at FROM hit_list_spots ORDER BY spot_id',
  );

describe('hit lists in SQLite (src/db/hit-lists.ts)', () => {
  let db: SQLiteDatabase;
  let a: Spot;
  let b: Spot;
  let list: HitList;

  beforeEach(async () => {
    db = await createMigratedTestDb();
    a = createTestSpot({ name: 'a', created_at: '2026-10-01T00:00:00.000Z' });
    b = createTestSpot({ name: 'b', created_at: '2026-10-02T00:00:00.000Z' });
    await insertSpot(db, a);
    await insertSpot(db, b);
    list = createTestHitList();
    await insertHitList(db, list);
  });

  it('insertHitList then getHitLists round-trips a manual list with no owner and no area', async () => {
    const lists = await getHitLists(db);

    expect(lists).toEqual([list]);
    expect(lists[0]).toMatchObject({ name: 'Downtown', kind: 'manual', shared: false });
    expect(lists[0].owner_id).toBeUndefined();
    expect(lists[0].area_center).toBeUndefined();
    expect(lists[0].area_radius_m).toBeUndefined();
    expect(lists[0].area_filters).toBeUndefined();
    expect(lists[0].area_place).toBeUndefined();
    expect(lists[0].deleted_at).toBeUndefined();
  });

  it('round-trips the reserved area columns and an owner', async () => {
    const area = createTestHitList({
      name: 'Capitol Hill',
      kind: 'area',
      owner_id: 'user-1',
      shared: true,
      area_center: CITIES.seattle,
      area_radius_m: 800,
      area_filters: { types: [FeatureType.Rail], stopped: false, natural_speed_min: 0 },
      area_place: 'Capitol Hill',
      created_at: '2026-10-03T00:00:00.000Z',
    });
    await insertHitList(db, area);

    expect((await getHitLists(db)).find((l) => l.id === area.id)).toEqual(area);
  });

  it('lists come back oldest first', async () => {
    const older = createTestHitList({ name: 'Older', created_at: '2026-01-01T00:00:00.000Z' });
    await insertHitList(db, older);

    expect((await getHitLists(db)).map((l) => l.name)).toEqual(['Older', 'Downtown']);
  });

  it('an unreadable area_filters_json reads as undefined with a warning, and the list still loads', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await db.runAsync('UPDATE hit_lists SET area_filters_json = ? WHERE id = ?', 'not json', list.id);

    const [read] = await getHitLists(db);

    expect(read.name).toBe('Downtown');
    expect(read.area_filters).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(list.id));
    warn.mockRestore();
  });

  it('an area center with only one coordinate set reads as no center', async () => {
    await db.runAsync('UPDATE hit_lists SET area_center_lat = 47.6 WHERE id = ?', list.id);

    expect((await getHitLists(db))[0].area_center).toBeUndefined();
  });

  it('addSpotsToList twice is idempotent and keeps the first added_at', async () => {
    await addSpotsToList(db, list.id, [a.id, b.id], '2026-10-05T00:00:00.000Z');
    await addSpotsToList(db, list.id, [a.id, b.id], '2026-10-06T00:00:00.000Z');

    expect(await getListMemberships(db)).toEqual({ [a.id]: [list.id], [b.id]: [list.id] });
    const rows = await memberRows(db);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.added_at === '2026-10-05T00:00:00.000Z')).toBe(true);
  });

  it('addSpotsToList with no ids writes nothing', async () => {
    await addSpotsToList(db, list.id, []);

    expect(await memberRows(db)).toEqual([]);
  });

  it('a spot in two lists maps to both ids', async () => {
    const bridges = createTestHitList({ name: 'Bridges', created_at: '2026-10-04T00:00:00.000Z' });
    await insertHitList(db, bridges);

    await addSpotsToList(db, list.id, [a.id], '2026-10-05T00:00:00.000Z');
    await addSpotsToList(db, bridges.id, [a.id], '2026-10-06T00:00:00.000Z');

    expect(await getListMemberships(db)).toEqual({ [a.id]: [list.id, bridges.id] });
  });

  it('removeSpotFromList removes only that row', async () => {
    await addSpotsToList(db, list.id, [a.id, b.id]);

    await removeSpotFromList(db, list.id, a.id);

    expect(await getListMemberships(db)).toEqual({ [b.id]: [list.id] });
  });

  it('softDeleteHitList hides the list and its memberships but never deletes spots', async () => {
    await addSpotsToList(db, list.id, [a.id, b.id]);

    await softDeleteHitList(db, list.id, '2026-10-07T00:00:00.000Z');

    expect(await getHitLists(db)).toEqual([]);
    expect(await getListMemberships(db)).toEqual({});
    expect((await getSpots(db)).map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(
      await db.getFirstAsync('SELECT deleted_at, updated_at FROM hit_lists WHERE id = ?', list.id),
    ).toEqual({ deleted_at: '2026-10-07T00:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z' });
  });

  it('a hard DELETE FROM spots cascades its hit_list_spots rows (foreign keys on)', async () => {
    await addSpotsToList(db, list.id, [a.id, b.id]);

    await db.runAsync('DELETE FROM spots WHERE id = ?', a.id);

    expect(await getListMemberships(db)).toEqual({ [b.id]: [list.id] });
  });

  it('a hard DELETE FROM hit_lists cascades its hit_list_spots rows and leaves the spots', async () => {
    await addSpotsToList(db, list.id, [a.id]);

    await db.runAsync('DELETE FROM hit_lists WHERE id = ?', list.id);

    expect(await memberRows(db)).toEqual([]);
    expect(await getSpots(db)).toHaveLength(2);
  });

  it('a membership for a spot that does not exist is rejected', async () => {
    await expect(addSpotsToList(db, list.id, ['no-such-spot'])).rejects.toThrow(/FOREIGN KEY/);

    expect(await memberRows(db)).toEqual([]);
  });

  it('updateHitList renames and bumps updated_at', async () => {
    await updateHitList(db, list.id, { name: 'Night mission' });

    const [read] = await getHitLists(db);
    expect(read.name).toBe('Night mission');
    expect(read.updated_at > list.updated_at).toBe(true);
    expect(read.created_at).toBe(list.created_at);
  });

  it("updateHitList uses the caller's updated_at so the store and DB agree, and leaves unset keys alone", async () => {
    await updateHitList(db, list.id, { shared: true, updated_at: '2026-10-08T00:00:00.000Z' });

    expect((await getHitLists(db))[0]).toEqual({
      ...list,
      shared: true,
      updated_at: '2026-10-08T00:00:00.000Z',
    });
  });

  it('updateHitList leaves a deleted list alone', async () => {
    await softDeleteHitList(db, list.id, '2026-10-07T00:00:00.000Z');

    await updateHitList(db, list.id, { name: 'Back from the dead' });

    expect(await db.getFirstAsync('SELECT name FROM hit_lists WHERE id = ?', list.id)).toEqual({
      name: 'Downtown',
    });
  });

  it('a soft-deleted spot keeps its membership row (the store selectors hide it)', async () => {
    await addSpotsToList(db, list.id, [a.id, b.id]);

    await softDeleteSpot(db, a.id);

    expect(await getListMemberships(db)).toEqual({ [a.id]: [list.id], [b.id]: [list.id] });
  });
});
