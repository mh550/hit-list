import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { insertSpot, updateSpot as dbUpdateSpot, softDeleteSpot } from '@/src/db';
import { useSpotsStore } from '@/src/stores';
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
   * Adds the spot, then (in the background) stores its town for the untitled label (D4). A failed insert takes the
   * spot back out of the store and rejects: photos saved to a spot the DB never got would all fail their foreign key.
   */
  const addSpot = useCallback(
    async (spot: Spot) => {
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
          if (town) await updateSpot(spot.id, { generated_name: town });
        })
        .catch(() => {}); // updateSpot logged it; the backfill retries next launch
    },
    [db, storeAddSpot, storeRemoveSpot, updateSpot],
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

  return { addSpot, updateSpot, removeSpot };
}
