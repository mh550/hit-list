import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { migrateDb, getSpots, getUserSettings } from '@/src/db';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';

export function useDbInit(): { isReady: boolean } {
  const db = useSQLiteContext();
  const setSpots = useSpotsStore((s) => s.setSpots);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await migrateDb(db);
        const spots = await getSpots(db);
        setSpots(spots);
        const settings = await getUserSettings(db);
        if (settings) {
          loadSettings(settings);
        }
        setIsReady(true);
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database:', err);
        setIsReady(true); // Allow app to proceed even on DB error
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isReady };
}
