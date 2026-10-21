import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { migrateDb, getSpots, getAllMedia, getUserSettings } from '@/src/db';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useMediaStore } from '@/src/stores/media-store';
import { backfillTowns } from '@/src/utils/reverse-geocode';

export function useDbInit(): { isReady: boolean } {
  const db = useSQLiteContext();
  const setSpots = useSpotsStore((s) => s.setSpots);
  const { updateSpot } = useSpotActions();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const setAllMedia = useMediaStore((s) => s.setAll);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      // A failed upgrade leaves the DB at its last good version and the load still goes ahead: skipping it would
      // look like every spot had vanished. Below version 3 this build's spot columns are missing, so getSpots
      // throws and the list stays empty until a later launch's retry succeeds; nothing on disk is lost.
      try {
        await migrateDb(db);
      } catch (err) {
        console.error('[useDbInit] Database migration failed:', err);
      }
      try {
        const spots = await getSpots(db);
        setSpots(spots);
        setAllMedia(await getAllMedia(db));
        const settings = await getUserSettings(db);
        if (settings) {
          loadSettings(settings);
        }
        setIsReady(true);
        // In the background, after the app is usable: towns for untitled spots (D4).
        void backfillTowns(spots, updateSpot);
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database:', err);
        setIsReady(true); // Allow app to proceed even on DB error
      }
    })();
  }, [db, setSpots, updateSpot, setAllMedia, loadSettings]); // all stable, so this still runs once

  return { isReady };
}
