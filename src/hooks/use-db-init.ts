import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { migrateDb, getSpots, getAllMedia, getUserSettings, updateSpot } from '@/src/db';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useMediaStore } from '@/src/stores/media-store';
import { backfillTowns } from '@/src/utils/reverse-geocode';

export function useDbInit(): { isReady: boolean } {
  const db = useSQLiteContext();
  const setSpots = useSpotsStore((s) => s.setSpots);
  const storeUpdateSpot = useSpotsStore((s) => s.updateSpot);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const setAllMedia = useMediaStore((s) => s.setAll);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await migrateDb(db);
        const spots = await getSpots(db);
        setSpots(spots);
        setAllMedia(await getAllMedia(db));
        const settings = await getUserSettings(db);
        if (settings) {
          loadSettings(settings);
        }
        setIsReady(true);
        // In the background, after the app is usable: towns for untitled spots (D4).
        void backfillTowns(spots, async (id, updates) => {
          storeUpdateSpot(id, updates);
          await updateSpot(db, id, updates).catch((err) => console.warn('[useDbInit] town save failed:', err));
        });
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database:', err);
        setIsReady(true); // Allow app to proceed even on DB error
      }
    })();
  }, [db, setSpots, storeUpdateSpot, setAllMedia, loadSettings]); // all stable, so this still runs once

  return { isReady };
}
