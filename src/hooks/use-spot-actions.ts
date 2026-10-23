import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { insertSpot, updateSpot as dbUpdateSpot, softDeleteSpot } from '@/src/db';
import { useSpotsStore } from '@/src/stores';
import { currentOwnerId } from '@/src/sync/owner';
import type { Spot, SpotUpdate } from '@/src/types';
import { geocodeTown } from '@/src/utils/reverse-geocode';

export function useSpotActions() {
  const db = useSQLiteContext();
  const storeAddSpot = useSpotsStore((s) => s.addSpot);
  const storeUpdateSpot = useSpotsStore((s) => s.updateSpot);
  const storeRevertSpotUpdate = useSpotsStore((s) => s.revertSpotUpdate);
  const storeRemoveSpot = useSpotsStore((s) => s.removeSpot);

  const updateSpot = useCallback(
    async (id: string, updates: SpotUpdate) => {
      // One stamp for memory and DB, so backfills that pass no updated_at don't leave the store stale.
      const stamped = { ...updates, updated_at: updates.updated_at ?? new Date().toISOString() };
      const find = () => useSpotsStore.getState().spots.find((s) => s.id === id);
      const before = find();
      storeUpdateSpot(id, stamped);
      const applied = find();
      try {
        await dbUpdateSpot(db, id, stamped);
      } catch (err) {
        // The DB still has the old values: so must the store, or the change would vanish on the next launch unseen.
        console.error('[useSpotActions] updateSpot failed:', err);
        if (before && applied) storeRevertSpotUpdate(id, before, applied);
        throw err;
      }
    },
    [db, storeUpdateSpot, storeRevertSpotUpdate],
  );

  /**
   * Stores a spot's town for the untitled label (D4) without moving its updated_at: a town found on this phone must
   * never outrank a newer edit made on another one (S5 sync, last write wins on updated_at).
   */
  const setTown = useCallback(
    (id: string, town: string) => {
      const current = useSpotsStore.getState().spots.find((s) => s.id === id);
      return updateSpot(id, { generated_name: town, updated_at: current?.updated_at });
    },
    [updateSpot],
  );

  /**
   * Adds the spot, then (in the background) stores its town. A new spot belongs to the signed-in rider once the phone
   * is theirs (currentOwnerId; S5-06), else to no one yet. A failed insert takes the spot back out of the store and
   * rejects: photos saved to a spot the DB never got would all fail their foreign key.
   */
  const addSpot = useCallback(
    async (added: Spot) => {
      const spot: Spot = added.owner_id ? added : { ...added, owner_id: currentOwnerId() };
      storeAddSpot(spot);
      try {
        await insertSpot(db, spot);
      } catch (err) {
        console.error('[useSpotActions] insertSpot failed:', err);
        storeRemoveSpot(spot.id);
        throw err;
      }
      void geocodeTown(spot.location)
        .then(async (town) => {
          if (town) await setTown(spot.id, town);
        })
        .catch(() => {}); // updateSpot logged it; the backfill retries next launch
    },
    [db, storeAddSpot, storeRemoveSpot, setTown],
  );

  const removeSpot = useCallback(
    async (id: string) => {
      const at = new Date().toISOString();
      storeRemoveSpot(id);
      try {
        await softDeleteSpot(db, id, at);
      } catch (err) {
        console.error('[useSpotActions] softDeleteSpot failed:', err);
      }
    },
    [db, storeRemoveSpot],
  );

  return { addSpot, updateSpot, setTown, removeSpot };
}
