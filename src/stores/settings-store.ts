import { create } from 'zustand';
import type { UserSettings, GearItem } from '@/src/types';
import { DEFAULT_USER_SETTINGS, UnitSystem } from '@/src/types';

interface SettingsState extends UserSettings {
  setUnits: (units: UnitSystem) => void;
  setBatchImportRadius: (radius: number) => void;
  setGear: (gear: GearItem[]) => void;
  addGear: (item: GearItem) => void;
  removeGear: (item: GearItem) => void;
  loadSettings: (settings: UserSettings) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_USER_SETTINGS,

  setUnits: (units) => set({ units }),

  setBatchImportRadius: (batch_import_radius) => set({ batch_import_radius }),

  setGear: (gear) => set({ gear }),

  addGear: (item) =>
    set((state) => ({
      gear: state.gear.includes(item) ? state.gear : [...state.gear, item],
    })),

  removeGear: (item) =>
    set((state) => ({
      gear: state.gear.filter((g) => g !== item),
    })),

  loadSettings: (settings) => set(settings),
}));
