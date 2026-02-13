import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { saveUserSettings } from '@/src/db';
import { useSettingsStore } from '@/src/stores/settings-store';
import type { GearItem, UnitSystem } from '@/src/types';

export function useSettingsActions() {
  const db = useSQLiteContext();
  const store = useSettingsStore();

  const persistCurrent = useCallback(async () => {
    const { units, batch_import_radius, gear } = useSettingsStore.getState();
    try {
      await saveUserSettings(db, { units, batch_import_radius, gear });
    } catch (err) {
      console.error('[useSettingsActions] saveUserSettings failed:', err);
    }
  }, [db]);

  const setUnits = useCallback(
    async (units: UnitSystem) => {
      store.setUnits(units);
      const { batch_import_radius, gear } = useSettingsStore.getState();
      try {
        await saveUserSettings(db, { units, batch_import_radius, gear });
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

  const toggleGear = useCallback(
    async (item: GearItem) => {
      const current = useSettingsStore.getState().gear;
      if (current.includes(item)) {
        store.removeGear(item);
      } else {
        store.addGear(item);
      }
      await persistCurrent();
    },
    [store, persistCurrent],
  );

  return { setUnits, setBatchImportRadius, toggleGear };
}
