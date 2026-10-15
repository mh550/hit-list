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
  const storeRemoveSpot = useSpotsStore((s) => s.removeSpot);

  const updateSpot = useCallback(
    async (id: string, updates: SpotUpdate) => {
      storeUpdateSpot(id, updates);
      try {
        await dbUpdateSpot(db, id, updates);
      } catch (err) {
        console.error('[useSpotActions] updateSpot failed:', err);
      }
    },
    [db, storeUpdateSpot],
  );

  /** Adds the spot, then (in the background) stores its town for the untitled label (D4). */
  const addSpot = useCallback(
    async (spot: Spot) => {
      storeAddSpot(spot);
      try {
        await insertSpot(db, spot);
      } catch (err) {
        console.error('[useSpotActions] insertSpot failed:', err);
      }
      void geocodeTown(spot.location).then(async (town) => {
        if (town) await updateSpot(spot.id, { generated_name: town });
      });
    },
    [db, storeAddSpot, updateSpot],
  );

  const removeSpot = useCallback(
    async (id: string) => {
      storeRemoveSpot(id);
      try {
        await softDeleteSpot(db, id);
      } catch (err) {
        console.error('[useSpotActions] softDeleteSpot failed:', err);
      }
    },
    [db, storeRemoveSpot],
  );

  return { addSpot, updateSpot, removeSpot };
}
