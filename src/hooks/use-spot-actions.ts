import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { insertSpot, updateSpot as dbUpdateSpot, softDeleteSpot } from '@/src/db';
import { useSpotsStore } from '@/src/stores';
import type { Spot } from '@/src/types';

export function useSpotActions() {
  const db = useSQLiteContext();
  const storeAddSpot = useSpotsStore((s) => s.addSpot);
  const storeUpdateSpot = useSpotsStore((s) => s.updateSpot);
  const storeRemoveSpot = useSpotsStore((s) => s.removeSpot);

  const addSpot = useCallback(
    async (spot: Spot) => {
      storeAddSpot(spot);
      try {
        await insertSpot(db, spot);
      } catch (err) {
        console.error('[useSpotActions] insertSpot failed:', err);
      }
    },
    [db, storeAddSpot],
  );

  const updateSpot = useCallback(
    async (id: string, updates: Partial<Spot>) => {
      storeUpdateSpot(id, updates);
      try {
        await dbUpdateSpot(db, id, updates);
      } catch (err) {
        console.error('[useSpotActions] updateSpot failed:', err);
      }
    },
    [db, storeUpdateSpot],
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
