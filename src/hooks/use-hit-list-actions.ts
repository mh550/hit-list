import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  insertHitList,
  updateHitList as dbUpdateHitList,
  softDeleteHitList,
  addSpotsToList as dbAddSpotsToList,
  removeSpotFromList as dbRemoveSpotFromList,
} from '@/src/db';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { assertOwn, currentOwnerId } from '@/src/sync/owner';
import type { HitList, HitListUpdate, NewHitList } from '@/src/types';
import { newId } from '@/src/utils/id';

const findList = (id: string) => useHitListsStore.getState().lists.find((l) => l.id === id);
const listsOf = (spotId: string) => useHitListsStore.getState().membershipBySpot[spotId] ?? [];

/**
 * List writes, optimistic like useSpotActions.updateSpot: the store changes first so the screen answers at once, then
 * the DB. A failed write is logged, the store is put back (the DB still has the old state, so the change would
 * vanish unseen on the next launch) and the promise rejects so the caller can say so.
 * Another rider's list can't be renamed, changed or deleted here ('not your list'), and another rider's spot never
 * goes into a list from this phone ('not your spot'): both reject before anything changes (S8, D47).
 */
export function useHitListActions() {
  const db = useSQLiteContext();
  const addList = useHitListsStore((s) => s.addList);
  const updateList = useHitListsStore((s) => s.updateList);
  const replaceList = useHitListsStore((s) => s.replaceList);
  const removeList = useHitListsStore((s) => s.removeList);
  const addMemberships = useHitListsStore((s) => s.addMemberships);
  const removeMemberships = useHitListsStore((s) => s.removeMemberships);
  const setActiveListId = useHitListsStore((s) => s.setActiveListId);

  const createList = useCallback(
    async (name: string, opts: NewHitList = { kind: 'manual' }): Promise<HitList> => {
      const now = new Date().toISOString();
      const list: HitList = {
        id: newId(),
        name: name.trim(),
        // the signed-in rider's once the phone is theirs (S5-06), else phone-only until adoption
        owner_id: currentOwnerId(),
        ...opts,
        shared: false,
        created_at: now,
        updated_at: now,
      };
      addList(list);
      try {
        await insertHitList(db, list);
      } catch (err) {
        console.error('[useHitListActions] createList failed:', err);
        removeList(list.id);
        throw err;
      }
      return list;
    },
    [db, addList, removeList],
  );

  const renameList = useCallback(
    async (id: string, name: string) => {
      const before = findList(id);
      assertOwn(before, 'list');
      // One stamp for memory and DB.
      const applied = { name: name.trim(), updated_at: new Date().toISOString() };
      updateList(id, applied);
      try {
        await dbUpdateHitList(db, id, applied);
      } catch (err) {
        console.error('[useHitListActions] renameList failed:', err);
        // Unless a later rename has replaced this one in the meantime.
        if (before && findList(id)?.updated_at === applied.updated_at) {
          updateList(id, { name: before.name, updated_at: before.updated_at });
        }
        throw err;
      }
    },
    [db, updateList],
  );

  // Named after the DB function it wraps; renameList stays for the name alone.
  const updateHitList = useCallback(
    async (id: string, updates: HitListUpdate) => {
      const before = findList(id);
      assertOwn(before, 'list');
      const applied: HitListUpdate = { ...updates, updated_at: new Date().toISOString() };
      updateList(id, applied);
      try {
        await dbUpdateHitList(db, id, applied);
      } catch (err) {
        console.error('[useHitListActions] updateHitList failed:', err);
        // Put back the keys this call patched (dropping those the list didn't have), unless a later update has
        // replaced it in the meantime.
        const current = findList(id);
        if (before && current?.updated_at === applied.updated_at) {
          const restored: Record<string, unknown> = { ...current, updated_at: before.updated_at };
          for (const key of Object.keys(updates) as (keyof HitListUpdate)[]) {
            if (before[key] === undefined) delete restored[key];
            else restored[key] = before[key];
          }
          replaceList(restored as unknown as HitList);
        }
        throw err;
      }
    },
    [db, updateList, replaceList],
  );

  const deleteList = useCallback(
    async (id: string) => {
      const before = findList(id);
      assertOwn(before, 'list');
      const wasActive = useHitListsStore.getState().activeListId === id;
      removeList(id);
      try {
        await softDeleteHitList(db, id, new Date().toISOString());
      } catch (err) {
        console.error('[useHitListActions] deleteList failed:', err);
        if (before) {
          addList(before);
          // Re-select it unless the user picked another list meanwhile.
          if (wasActive && useHitListsStore.getState().activeListId === null) setActiveListId(id);
        }
        throw err;
      }
    },
    [db, addList, removeList, setActiveListId],
  );

  const addSpotsToList = useCallback(
    async (listId: string, spotIds: string[]) => {
      const spots = useSpotsStore.getState().spots;
      for (const spotId of spotIds) assertOwn(spots.find((s) => s.id === spotId), 'spot');
      // A failure takes out only what this call added; spots already in the list stay.
      const added = [...new Set(spotIds)].filter((spotId) => !listsOf(spotId).includes(listId));
      addMemberships(listId, spotIds);
      try {
        await dbAddSpotsToList(db, listId, spotIds, new Date().toISOString(), currentOwnerId() ?? null);
      } catch (err) {
        console.error('[useHitListActions] addSpotsToList failed:', err);
        removeMemberships(listId, added);
        throw err;
      }
    },
    [db, addMemberships, removeMemberships],
  );

  const removeSpotFromList = useCallback(
    async (listId: string, spotId: string) => {
      const wasIn = listsOf(spotId).includes(listId);
      removeMemberships(listId, [spotId]);
      try {
        await dbRemoveSpotFromList(db, listId, spotId);
      } catch (err) {
        console.error('[useHitListActions] removeSpotFromList failed:', err);
        if (wasIn) addMemberships(listId, [spotId]);
        throw err;
      }
    },
    [db, addMemberships, removeMemberships],
  );

  return { createList, renameList, updateHitList, deleteList, addSpotsToList, removeSpotFromList };
}
