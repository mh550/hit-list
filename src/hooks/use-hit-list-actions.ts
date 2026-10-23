import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  insertHitList,
  updateHitList as dbUpdateHitList,
  softDeleteHitList,
  addSpotsToList as dbAddSpotsToList,
  removeSpotFromList as dbRemoveSpotFromList,
} from '@/src/db';
import { useHitListsStore } from '@/src/stores';
import type { HitList, HitListUpdate, NewHitList } from '@/src/types';
import { newId } from '@/src/utils/id';

const findList = (id: string) => useHitListsStore.getState().lists.find((l) => l.id === id);
const listsOf = (spotId: string) => useHitListsStore.getState().membershipBySpot[spotId] ?? [];

/**
 * List writes, optimistic like useSpotActions.updateSpot: the store changes first so the screen answers at once, then
 * the DB. A failed write is logged, the store is put back (the DB still has the old state, so the change would
 * vanish unseen on the next launch) and the promise rejects so the caller can say so.
 */
export function useHitListActions() {
  const db = useSQLiteContext();
  const addList = useHitListsStore((s) => s.addList);
  const updateList = useHitListsStore((s) => s.updateList);
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
      const applied: HitListUpdate = { ...updates, updated_at: new Date().toISOString() };
      updateList(id, applied);
      try {
        await dbUpdateHitList(db, id, applied);
      } catch (err) {
        console.error('[useHitListActions] updateHitList failed:', err);
        // Put back the keys this call patched, unless a later update has replaced it in the meantime.
        if (before && findList(id)?.updated_at === applied.updated_at) {
          const restore: HitListUpdate = { updated_at: before.updated_at };
          for (const key of Object.keys(updates) as (keyof HitListUpdate)[]) {
            Object.assign(restore, { [key]: before[key] ?? (key === 'area_place' ? null : undefined) });
          }
          updateList(id, restore);
        }
        throw err;
      }
    },
    [db, updateList],
  );

  const deleteList = useCallback(
    async (id: string) => {
      const before = findList(id);
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
      // A failure takes out only what this call added; spots already in the list stay.
      const added = [...new Set(spotIds)].filter((spotId) => !listsOf(spotId).includes(listId));
      addMemberships(listId, spotIds);
      try {
        await dbAddSpotsToList(db, listId, spotIds, new Date().toISOString());
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
