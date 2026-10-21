import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { saveUserSettings } from '@/src/db';
import { useSettingsStore } from '@/src/stores/settings-store';
import type { UnitSystem } from '@/src/types';

export function useSettingsActions() {
  const db = useSQLiteContext();
  const store = useSettingsStore();

  const persistCurrent = useCallback(async () => {
    const { units, batch_import_radius } = useSettingsStore.getState();
    try {
      await saveUserSettings(db, { units, batch_import_radius });
    } catch (err) {
      console.error('[useSettingsActions] saveUserSettings failed:', err);
    }
  }, [db]);

  const setUnits = useCallback(
    async (units: UnitSystem) => {
      store.setUnits(units);
      const { batch_import_radius } = useSettingsStore.getState();
      try {
        await saveUserSettings(db, { units, batch_import_radius });
      } catch (err) {
        console.error('[useSettingsActions] setUnits persist failed:', err);
      }
    },
    [db, store],
  );

  const setBatchImportRadius = useCallback(
    async (radius: number) => {
      store.setBatchImportRadius(radius);
      await persistCurrent();
    },
    [store, persistCurrent],
  );

  return { setUnits, setBatchImportRadius };
}
