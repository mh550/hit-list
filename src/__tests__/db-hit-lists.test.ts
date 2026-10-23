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
import { deleteMember, deleteMembers, getMembers, getMyMemberships, replaceMembers, upsertMembers } from '@/src/db/hit-lists';
import { upsertProfiles } from '@/src/db/profiles';
import { FeatureType, type HitList, type ListMember, type Spot } from '@/src/types';

type Row = Record<string, unknown>;
import { CITIES, createTestHitList, createTestSpot } from './factories';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';

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

  it('two addSpotsToList calls at once both land (no shared BEGIN on the one connection)', async () => {
    const bridges = createTestHitList({ name: 'Bridges' });
    await insertHitList(db, bridges);

    await Promise.all([
      addSpotsToList(db, list.id, [a.id, b.id], '2026-10-05T00:00:00.000Z'),
      addSpotsToList(db, bridges.id, [a.id, b.id], '2026-10-05T00:00:00.000Z'),
    ]);

    expect(await memberRows(db)).toHaveLength(4);
  });

  it('a remove running during an add is not undone by it', async () => {
    await addSpotsToList(db, list.id, [a.id]);
    const bridges = createTestHitList({ name: 'Bridges' });
    await insertHitList(db, bridges);

    await Promise.all([addSpotsToList(db, bridges.id, [a.id, b.id]), removeSpotFromList(db, list.id, a.id)]);

    expect(await getListMemberships(db)).toEqual({ [a.id]: [bridges.id], [b.id]: [bridges.id] });
  });

  it('addSpotsToList is all or nothing: an unknown spot id writes no rows', async () => {
    await expect(addSpotsToList(db, list.id, [a.id, 'no-such-spot'])).rejects.toThrow();

    expect(await memberRows(db)).toEqual([]);
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

  describe('area lists', () => {
    let areaList: HitList;

    beforeEach(async () => {
      areaList = createTestHitList({
        name: 'Weekend',
        kind: 'area',
        area_center: CITIES.seattle,
        area_radius_m: 3219,
        area_place: 'Capitol Hill',
        area_filters: { types: [FeatureType.Rail] },
        created_at: '2026-10-04T00:00:00.000Z',
      });
      await insertHitList(db, areaList);
    });

    const readArea = async () => (await getHitLists(db)).find((l) => l.id === areaList.id);

    it('an area list round-trips its center, radius, place and filters, and holds no hit_list_spots rows', async () => {
      expect(await readArea()).toEqual(areaList);
      expect(await memberRows(db)).toEqual([]);
    });

    it('updateHitList changes the center, radius, place and filters', async () => {
      const updates = {
        area_center: CITIES.portland,
        area_radius_m: 8047,
        area_place: 'Pearl District',
        area_filters: { types: [FeatureType.Ledge], stopped: true },
        updated_at: '2026-10-09T00:00:00.000Z',
      };
      await updateHitList(db, areaList.id, updates);

      expect(await readArea()).toEqual({ ...areaList, ...updates });
    });

    it('updateHitList with area_place: null clears the place and nothing else', async () => {
      await updateHitList(db, areaList.id, { area_place: null, updated_at: '2026-10-09T00:00:00.000Z' });

      const { area_place: _dropped, ...rest } = areaList;
      expect(await readArea()).toEqual({ ...rest, updated_at: '2026-10-09T00:00:00.000Z' });
    });

    it('a name-only update leaves the area columns', async () => {
      await updateHitList(db, areaList.id, { name: 'Sunday', updated_at: '2026-10-09T00:00:00.000Z' });

      expect(await readArea()).toEqual({ ...areaList, name: 'Sunday', updated_at: '2026-10-09T00:00:00.000Z' });
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

  describe('outbox (migration 5 triggers)', () => {
    let mine: HitList;
    let s1: Spot;
    let s2: Spot;
    let s3: Spot;

    beforeEach(async () => {
      await adoptPhoneFor(db);
      mine = createTestHitList({ owner_id: ME, name: 'Mine' });
      s1 = createTestSpot({ owner_id: ME });
      s2 = createTestSpot({ owner_id: ME });
      s3 = createTestSpot({ owner_id: ME });
      await insertHitList(db, mine);
      for (const s of [s1, s2, s3]) await insertSpot(db, s);
      await db.runAsync('DELETE FROM sync_outbox'); // only what each case writes
    });

    it('insert, update and soft delete of an owned list each append one row: upsert, upsert, delete', async () => {
      const l = createTestHitList({ owner_id: ME });

      await insertHitList(db, l);
      await updateHitList(db, l.id, { name: 'Renamed' });
      await softDeleteHitList(db, l.id);

      expect(await outboxOps(db)).toEqual([
        ['hit_list', l.id, 'upsert'],
        ['hit_list', l.id, 'upsert'],
        ['hit_list', l.id, 'delete'],
      ]);
    });

    it('a phone-only list appends nothing, and neither do its memberships', async () => {
      await updateHitList(db, list.id, { name: 'Renamed' });
      await addSpotsToList(db, list.id, [s1.id]);
      await removeSpotFromList(db, list.id, s1.id);
      await softDeleteHitList(db, list.id);

      expect(await outboxOps(db)).toEqual([]);
    });

    it("addSpotsToList of 3 (1 already in) appends 2 upserts with entity_id 'list/spot'", async () => {
      await addSpotsToList(db, mine.id, [s1.id]);
      await db.runAsync('DELETE FROM sync_outbox');

      await addSpotsToList(db, mine.id, [s1.id, s2.id, s3.id]);

      expect(await outboxOps(db)).toEqual([
        ['hit_list_spot', `${mine.id}/${s2.id}`, 'upsert'],
        ['hit_list_spot', `${mine.id}/${s3.id}`, 'upsert'],
      ]);
    });

    it("removeSpotFromList appends 'delete' for the membership", async () => {
      await addSpotsToList(db, mine.id, [s1.id]);

      await removeSpotFromList(db, mine.id, s1.id);

      expect(await outboxOps(db)).toEqual([
        ['hit_list_spot', `${mine.id}/${s1.id}`, 'upsert'],
        ['hit_list_spot', `${mine.id}/${s1.id}`, 'delete'],
      ]);
    });

    it('a membership whose spot has no owner yet appends nothing (adoption queues it later)', async () => {
      await addSpotsToList(db, mine.id, [a.id]);
      await removeSpotFromList(db, mine.id, a.id);

      expect(await outboxOps(db)).toEqual([]);
    });

    it("my spot in another rider's list queues (a member's add, migration 8)", async () => {
      const theirs = createTestHitList({ owner_id: 'someone-else' });
      await insertHitList(db, theirs);

      await addSpotsToList(db, theirs.id, [s1.id]);

      expect(await outboxOps(db)).toEqual([['hit_list_spot', `${theirs.id}/${s1.id}`, 'upsert']]);
    });

    it('a membership written with a rev (a pull) appends nothing; deleting one marked rev = -1 appends nothing', async () => {
      await db.runAsync(
        "INSERT INTO hit_list_spots (list_id, spot_id, added_at, rev) VALUES (?, ?, 'x', 3)",
        mine.id,
        s1.id,
      );
      expect(await outboxOps(db)).toEqual([]);
      await addSpotsToList(db, mine.id, [s2.id]);
      await db.runAsync('DELETE FROM sync_outbox');

      await db.runAsync('UPDATE hit_list_spots SET rev = -1 WHERE list_id = ? AND spot_id = ?', mine.id, s2.id);
      await removeSpotFromList(db, mine.id, s2.id);

      expect(await outboxOps(db)).toEqual([]);
    });

    it('addSpotsToList that fails on its second spot (unknown id) leaves no membership and no outbox row', async () => {
      await expect(addSpotsToList(db, mine.id, [s1.id, 'missing'])).rejects.toThrow();

      expect(await memberRows(db)).toEqual([]);
      expect(await outboxOps(db)).toEqual([]);
    });

    it('deleting a list twice queues one delete and keeps the first deleted_at', async () => {
      await softDeleteHitList(db, mine.id, '2026-10-23T01:00:00.000Z');
      await softDeleteHitList(db, mine.id, '2026-10-23T02:00:00.000Z');

      expect(await outboxOps(db)).toEqual([['hit_list', mine.id, 'delete']]);
      expect(await db.getFirstAsync('SELECT deleted_at, updated_at FROM hit_lists WHERE id = ?', mine.id)).toEqual({
        deleted_at: '2026-10-23T01:00:00.000Z',
        updated_at: '2026-10-23T01:00:00.000Z',
      });
    });

    it('a hard delete of an owned spot or list cascades its memberships and queues no membership delete', async () => {
      await addSpotsToList(db, mine.id, [s1.id, s2.id]);
      const other = createTestHitList({ owner_id: ME });
      await insertHitList(db, other);
      await addSpotsToList(db, other.id, [s3.id]);
      await db.runAsync('DELETE FROM sync_outbox');

      await db.runAsync('DELETE FROM spots WHERE id = ?', s1.id);
      await db.runAsync('DELETE FROM hit_lists WHERE id = ?', other.id);

      expect(await memberRows(db)).toEqual([expect.objectContaining({ list_id: mine.id, spot_id: s2.id })]);
      expect(await outboxOps(db)).toEqual([]);
    });
  });
});

describe('the members mirror (migration 8, src/db/hit-lists.ts)', () => {
  let db: SQLiteDatabase;
  const ANA = 'rider-ana';
  const BEN = 'rider-ben';
  const member = (overrides: Partial<ListMember> = {}): ListMember => ({
    list_id: 'list-1',
    user_id: ANA,
    role: 'add',
    status: 'member',
    joined_at: '2026-10-23T09:00:00.000Z',
    ...overrides,
  });
  const allRows = () =>
    db.getAllAsync('SELECT list_id, user_id, role, status, joined_at FROM hit_list_members ORDER BY list_id, user_id');

  beforeEach(async () => {
    db = await createMigratedTestDb();
  });

  it('addSpotsToList writes added_by when given (a member add), NULL otherwise', async () => {
    const spot = createTestSpot();
    await insertSpot(db, spot);
    const list = createTestHitList();
    const other = createTestHitList();
    await insertHitList(db, list);
    await insertHitList(db, other);

    await addSpotsToList(db, list.id, [spot.id], '2026-10-23T00:00:00.000Z', ME);
    await addSpotsToList(db, other.id, [spot.id]);

    expect(
      await db.getAllAsync('SELECT list_id, added_by FROM hit_list_spots WHERE spot_id = ? ORDER BY added_by', spot.id),
    ).toEqual([
      { list_id: other.id, added_by: null },
      { list_id: list.id, added_by: ME },
    ]);
  });

  it('upsertMembers inserts rows and updates role, status and joined_at of known ones', async () => {
    await upsertMembers(db, [member(), member({ user_id: BEN, status: 'invited', role: 'view', joined_at: undefined })]);
    await upsertMembers(db, [member({ user_id: BEN, status: 'member', joined_at: '2026-10-23T10:00:00.000Z' })]);

    expect(await allRows()).toEqual([
      { list_id: 'list-1', user_id: ANA, role: 'add', status: 'member', joined_at: '2026-10-23T09:00:00.000Z' },
      { list_id: 'list-1', user_id: BEN, role: 'add', status: 'member', joined_at: '2026-10-23T10:00:00.000Z' },
    ]);
  });

  it('upsertMembers of nothing writes nothing', async () => {
    await upsertMembers(db, []);
    expect(await allRows()).toEqual([]);
  });

  it('replaceMembers makes the mirror exactly the rows given and says whether anything changed', async () => {
    await upsertMembers(db, [member(), member({ user_id: BEN }), member({ list_id: 'list-2' })]);

    expect(await replaceMembers(db, [member(), member({ list_id: 'list-2', role: 'view' })])).toBe(true);
    expect(await allRows()).toEqual([
      { list_id: 'list-1', user_id: ANA, role: 'add', status: 'member', joined_at: '2026-10-23T09:00:00.000Z' },
      { list_id: 'list-2', user_id: ANA, role: 'view', status: 'member', joined_at: '2026-10-23T09:00:00.000Z' },
    ]);
    expect(await replaceMembers(db, [member(), member({ list_id: 'list-2', role: 'view' })])).toBe(false);
    expect(await replaceMembers(db, [])).toBe(true);
    expect(await allRows()).toEqual([]);
  });

  it('getMembers lists one list: joined members first, then invitations, with usernames from the profiles mirror', async () => {
    await upsertProfiles(db, [{ id: BEN, username: 'ben', display_name: null }]);
    await upsertMembers(db, [
      member({ user_id: 'rider-cal', status: 'invited', joined_at: undefined }),
      member({ user_id: BEN, role: 'view' }),
      member({ list_id: 'list-2' }),
    ]);

    expect(await getMembers(db, 'list-1')).toEqual([
      { list_id: 'list-1', user_id: BEN, role: 'view', status: 'member', joined_at: '2026-10-23T09:00:00.000Z', username: 'ben' },
      { list_id: 'list-1', user_id: 'rider-cal', role: 'add', status: 'invited' },
    ]);
  });

  it("getMyMemberships maps each list to the rider's own role and status", async () => {
    await upsertMembers(db, [
      member({ user_id: ME, role: 'view' }),
      member({ list_id: 'list-2', user_id: ME, status: 'invited', joined_at: undefined }),
      member({ list_id: 'list-3' }),
    ]);

    expect(await getMyMemberships(db, ME)).toEqual({
      'list-1': { role: 'view', status: 'member' },
      'list-2': { role: 'add', status: 'invited' },
    });
  });

  it('deleteMembers drops one list; deleteMember drops one row', async () => {
    await upsertMembers(db, [member(), member({ user_id: BEN }), member({ list_id: 'list-2' })]);

    await deleteMember(db, 'list-1', BEN);
    expect((await allRows()).map((r) => `${String((r as Row).list_id)}/${String((r as Row).user_id)}`)).toEqual([
      `list-1/${ANA}`,
      `list-2/${ANA}`,
    ]);
    await deleteMembers(db, 'list-1');
    expect(await getMembers(db, 'list-1')).toEqual([]);
    expect(await getMembers(db, 'list-2')).toHaveLength(1);
  });

  it('getHitLists attaches each list its members (user_id, username, role, status); a private list has none', async () => {
    const shared = createTestHitList({ id: 'list-1', owner_id: ME, shared: true });
    const priv = createTestHitList({ id: 'list-9', owner_id: ME });
    await insertHitList(db, shared);
    await insertHitList(db, priv);
    await upsertProfiles(db, [{ id: ANA, username: 'ana', display_name: 'Ana' }]);
    await upsertMembers(db, [member(), member({ user_id: BEN, status: 'invited', role: 'view', joined_at: undefined })]);

    const lists = await getHitLists(db);

    expect(lists.find((l) => l.id === 'list-1')?.members).toEqual([
      { user_id: ANA, username: 'ana', role: 'add', status: 'member' },
      { user_id: BEN, role: 'view', status: 'invited' },
    ]);
    expect(lists.find((l) => l.id === 'list-9')).not.toHaveProperty('members');
  });
});
