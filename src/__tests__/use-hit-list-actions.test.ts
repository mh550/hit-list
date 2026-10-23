import { renderHook, act } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getHitLists, getListMemberships, insertHitList, insertSpot } from '@/src/db';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { useHitListsStore } from '@/src/stores';
import { FeatureType } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { ME, adoptPhoneFor, outboxOps } from './helpers/outbox';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';
import type { HitList } from '@/src/types';

let mockDb: SQLiteDatabase;
jest.mock('expo-sqlite', () => ({
  ...jest.requireActual('expo-sqlite'),
  useSQLiteContext: () => mockDb,
}));

const initial = useHitListsStore.getState();
const store = () => useHitListsStore.getState();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A list already saved in both the DB and the store, as useDbInit leaves it. */
async function seedList(overrides = {}) {
  const list = createTestHitList(overrides);
  await insertHitList(mockDb, list);
  store().addList(list);
  return list;
}

function failNextWrite() {
  const err = new Error('disk full');
  jest.spyOn(mockDb, 'runAsync').mockRejectedValueOnce(err);
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  return { err, consoleSpy };
}

describe('useHitListActions', () => {
  beforeEach(async () => {
    useHitListsStore.setState(initial, true);
    mockDb = await createMigratedTestDb();
    await insertSpot(mockDb, createTestSpot({ id: 'a' }));
    await insertSpot(mockDb, createTestSpot({ id: 'b' }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('createList adds a manual, unshared list to the store and the DB and returns it', async () => {
    const { result } = renderHook(() => useHitListActions());
    let created!: Awaited<ReturnType<typeof result.current.createList>>;
    await act(async () => {
      created = await result.current.createList('  Downtown ');
    });

    expect(created).toEqual(
      expect.objectContaining({ name: 'Downtown', kind: 'manual', shared: false, updated_at: created.created_at }),
    );
    expect(created.id).toMatch(UUID);
    expect(Number.isNaN(Date.parse(created.created_at))).toBe(false);
    expect(store().lists).toEqual([created]);
    expect(await getHitLists(mockDb)).toEqual([created]);
  });

  it('createList puts the list in the store before the DB write resolves', async () => {
    const { result } = renderHook(() => useHitListActions());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.createList('Night');
    });
    expect(store().lists.map((l) => l.name)).toEqual(['Night']);
    await act(async () => {
      await pending;
    });
  });

  it('createList: a failed insert takes the list back out and rejects', async () => {
    const { err, consoleSpy } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(result.current.createList('Downtown')).rejects.toBe(err);
    });
    expect(store().lists).toEqual([]);
    expect(await getHitLists(mockDb)).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith('[useHitListActions] createList failed:', err);
  });

  it('createList with area options saves an area list (centre, radius, place, filters) to the store and the DB', async () => {
    const { result } = renderHook(() => useHitListActions());
    let created!: Awaited<ReturnType<typeof result.current.createList>>;
    await act(async () => {
      created = await result.current.createList('Weekend', {
        kind: 'area',
        area_center: CITIES.seattle,
        area_radius_m: 3219,
        area_place: 'Capitol Hill',
        area_filters: { types: [FeatureType.Rail], stopped: false },
      });
    });

    expect(created).toEqual(
      expect.objectContaining({
        name: 'Weekend',
        kind: 'area',
        area_center: CITIES.seattle,
        area_radius_m: 3219,
        area_place: 'Capitol Hill',
        area_filters: { types: [FeatureType.Rail], stopped: false },
      }),
    );
    expect(store().lists).toEqual([created]);
    expect(await getHitLists(mockDb)).toEqual([created]);
    expect(await getListMemberships(mockDb)).toEqual({});
  });

  it('createList: an area list with no place leaves area_place out', async () => {
    const { result } = renderHook(() => useHitListActions());
    let created!: Awaited<ReturnType<typeof result.current.createList>>;
    await act(async () => {
      created = await result.current.createList('Around', {
        kind: 'area',
        area_center: CITIES.seattle,
        area_radius_m: 1609,
        area_filters: { types: [] },
      });
    });

    expect(created).toEqual(expect.objectContaining({ kind: 'area', area_radius_m: 1609 }));
    expect(created.area_place).toBeUndefined();
    expect(await getHitLists(mockDb)).toEqual([created]);
  });

  it('updateHitList patches the store first, then the DB, with one updated_at', async () => {
    const list = await seedList({
      kind: 'area',
      area_center: CITIES.seattle,
      area_radius_m: 3219,
      area_place: 'Capitol Hill',
      area_filters: { types: [] },
    });
    const { result } = renderHook(() => useHitListActions());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.updateHitList(list.id, {
        area_center: CITIES.portland,
        area_radius_m: 8047,
        area_place: null,
        area_filters: { types: [FeatureType.Ledge] },
      });
    });
    expect(store().lists[0].area_center).toEqual(CITIES.portland);
    await act(async () => {
      await pending;
    });

    const [saved] = await getHitLists(mockDb);
    expect(saved).toEqual(
      expect.objectContaining({
        area_center: CITIES.portland,
        area_radius_m: 8047,
        area_filters: { types: [FeatureType.Ledge] },
      }),
    );
    expect(saved.area_place).toBeUndefined();
    expect(saved.updated_at > list.updated_at).toBe(true);
    expect(store().lists[0]).toEqual(saved);
  });

  it('updateHitList: a failed write restores every patched key and rejects', async () => {
    const list = await seedList({
      kind: 'area',
      area_center: CITIES.seattle,
      area_radius_m: 3219,
      area_place: 'Capitol Hill',
      area_filters: { types: [] },
    });
    const { err, consoleSpy } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(
        result.current.updateHitList(list.id, { area_center: CITIES.portland, area_radius_m: 8047, area_place: null }),
      ).rejects.toBe(err);
    });
    expect(store().lists).toEqual([list]);
    expect(await getHitLists(mockDb)).toEqual([list]);
    expect(consoleSpy).toHaveBeenCalledWith('[useHitListActions] updateHitList failed:', err);
  });

  it('updateHitList: a failed write takes back a key the list did not have before', async () => {
    const list = await seedList({ kind: 'area', area_center: CITIES.seattle, area_radius_m: 3219 });
    const { err } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(
        result.current.updateHitList(list.id, { area_filters: { types: [FeatureType.Rail] } }),
      ).rejects.toBe(err);
    });
    expect(store().lists[0].area_filters).toBeUndefined();
    expect(store().lists).toEqual([list]);
  });

  it('updateHitList: a failed write that clears no place keeps a list that had none without one', async () => {
    const list = await seedList({ kind: 'area', area_center: CITIES.seattle, area_radius_m: 3219 });
    const { err } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(result.current.updateHitList(list.id, { area_place: 'Fremont' })).rejects.toBe(err);
    });
    expect(store().lists).toEqual([list]);
  });

  it('renameList renames in the store first, then the DB, with one updated_at', async () => {
    const list = await seedList();
    const { result } = renderHook(() => useHitListActions());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.renameList(list.id, 'Night mission');
    });
    expect(store().lists[0].name).toBe('Night mission');
    await act(async () => {
      await pending;
    });

    const [saved] = await getHitLists(mockDb);
    expect(saved.name).toBe('Night mission');
    expect(saved.updated_at > list.updated_at).toBe(true);
    expect(store().lists[0]).toEqual(saved);
  });

  it('renameList: a failed write restores the name and updated_at and rejects', async () => {
    const list = await seedList();
    const { err, consoleSpy } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(result.current.renameList(list.id, 'Night mission')).rejects.toBe(err);
    });
    expect(store().lists).toEqual([list]);
    expect(consoleSpy).toHaveBeenCalledWith('[useHitListActions] renameList failed:', err);
  });

  it('deleteList soft-deletes: gone from the store and getHitLists, spots untouched', async () => {
    const list = await seedList();
    store().setActiveListId(list.id);
    const { result } = renderHook(() => useHitListActions());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.deleteList(list.id);
    });
    expect(store().lists).toEqual([]);
    expect(store().activeListId).toBeNull();
    await act(async () => {
      await pending;
    });

    expect(await getHitLists(mockDb)).toEqual([]);
    const row = await mockDb.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM hit_lists WHERE id = ?',
      list.id,
    );
    expect(row?.deleted_at).toEqual(expect.any(String));
    expect(await mockDb.getAllAsync('SELECT id FROM spots')).toHaveLength(2);
  });

  it('deleteList: a failed write puts the list back, re-selects it, and rejects', async () => {
    const list = await seedList();
    store().setActiveListId(list.id);
    const { err, consoleSpy } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(result.current.deleteList(list.id)).rejects.toBe(err);
    });
    expect(store().lists).toEqual([list]);
    expect(store().activeListId).toBe(list.id);
    expect(consoleSpy).toHaveBeenCalledWith('[useHitListActions] deleteList failed:', err);
  });

  it('deleteList: a failed write keeps a list the user picked while it was pending', async () => {
    const list = await seedList();
    const other = await seedList({ name: 'Night' });
    store().setActiveListId(list.id);
    const { err } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.deleteList(list.id);
    });
    act(() => store().setActiveListId(other.id));
    await act(async () => {
      await expect(pending).rejects.toBe(err);
    });
    expect(store().lists.map((l) => l.id).sort()).toEqual([list.id, other.id].sort());
    expect(store().activeListId).toBe(other.id);
  });

  it('addSpotsToList adds memberships in the store first, then the DB', async () => {
    const list = await seedList();
    const { result } = renderHook(() => useHitListActions());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.addSpotsToList(list.id, ['a', 'b']);
    });
    expect(store().membershipBySpot).toEqual({ a: [list.id], b: [list.id] });
    await act(async () => {
      await pending;
    });
    expect(await getListMemberships(mockDb)).toEqual({ a: [list.id], b: [list.id] });
  });

  it('addSpotsToList: a failed write removes only the spots that were not already in the list', async () => {
    const list = await seedList();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await result.current.addSpotsToList(list.id, ['a']);
    });

    const { err, consoleSpy } = failNextWrite();
    await act(async () => {
      await expect(result.current.addSpotsToList(list.id, ['a', 'b'])).rejects.toBe(err);
    });
    expect(store().membershipBySpot).toEqual({ a: [list.id] });
    expect(await getListMemberships(mockDb)).toEqual({ a: [list.id] });
    expect(consoleSpy).toHaveBeenCalledWith('[useHitListActions] addSpotsToList failed:', err);
  });

  it('removeSpotFromList removes the membership in the store first, then the DB', async () => {
    const list = await seedList();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await result.current.addSpotsToList(list.id, ['a', 'b']);
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.removeSpotFromList(list.id, 'a');
    });
    expect(store().membershipBySpot).toEqual({ b: [list.id] });
    await act(async () => {
      await pending;
    });
    expect(await getListMemberships(mockDb)).toEqual({ b: [list.id] });
  });

  it('removeSpotFromList: a failed write puts the membership back and rejects', async () => {
    const list = await seedList();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await result.current.addSpotsToList(list.id, ['a']);
    });
    const { err, consoleSpy } = failNextWrite();
    await act(async () => {
      await expect(result.current.removeSpotFromList(list.id, 'a')).rejects.toBe(err);
    });
    expect(store().membershipBySpot).toEqual({ a: [list.id] });
    expect(await getListMemberships(mockDb)).toEqual({ a: [list.id] });
    expect(consoleSpy).toHaveBeenCalledWith('[useHitListActions] removeSpotFromList failed:', err);
  });

  it('removeSpotFromList: a failed write for a spot that was not in the list adds nothing', async () => {
    const list = await seedList();
    const { err, consoleSpy } = failNextWrite();
    const { result } = renderHook(() => useHitListActions());
    await act(async () => {
      await expect(result.current.removeSpotFromList(list.id, 'a')).rejects.toBe(err);
    });
    expect(store().membershipBySpot).toEqual({});
    consoleSpy.mockRestore();
  });

  describe('owner of a new list (S5-06)', () => {
    afterEach(() => useSyncStore.setState(INITIAL_SYNC));

    it("a list made once the rider's rows are adopted is theirs, and queues its upsert", async () => {
      await adoptPhoneFor(mockDb, ME);
      useSyncStore.setState({ adoptedUserId: ME });
      const { result } = renderHook(() => useHitListActions());

      let list: HitList | undefined;
      await act(async () => {
        list = await result.current.createList('Night');
      });

      expect(list?.owner_id).toBe(ME);
      expect((await getHitLists(mockDb))[0].owner_id).toBe(ME);
      expect(await outboxOps(mockDb)).toEqual([['hit_list', list!.id, 'upsert']]);
    });

    it('addSpotsToList stamps added_by with the adopted rider (S8: a member add), none signed out', async () => {
      const { result } = renderHook(() => useHitListActions());
      const list = createTestHitList();
      await insertHitList(mockDb, list);
      await act(async () => {
        await result.current.addSpotsToList(list.id, ['a']);
      });
      useSyncStore.setState({ adoptedUserId: ME });
      await act(async () => {
        await result.current.addSpotsToList(list.id, ['b']);
      });

      expect(
        await mockDb.getAllAsync('SELECT spot_id, added_by FROM hit_list_spots WHERE list_id = ? ORDER BY spot_id', list.id),
      ).toEqual([
        { spot_id: 'a', added_by: null },
        { spot_id: 'b', added_by: ME },
      ]);
    });

    it('signed out (no adopted rider) the list stays phone-only', async () => {
      await adoptPhoneFor(mockDb, ME); // Keep: the account's rows are still here
      const { result } = renderHook(() => useHitListActions());

      await act(async () => {
        await result.current.createList('Night');
      });

      expect((await getHitLists(mockDb))[0].owner_id).toBeUndefined();
      expect(await outboxOps(mockDb)).toEqual([]);
    });
  });
});
