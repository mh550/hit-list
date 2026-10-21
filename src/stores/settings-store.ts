import { create } from 'zustand';
import type { UserSettings } from '@/src/types';
import { DEFAULT_USER_SETTINGS, UnitSystem } from '@/src/types';

interface SettingsState extends UserSettings {
  setUnits: (units: UnitSystem) => void;
  setBatchImportRadius: (radius: number) => void;
  loadSettings: (settings: UserSettings) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_USER_SETTINGS,

  setUnits: (units) => set({ units }),

  setBatchImportRadius: (batch_import_radius) => set({ batch_import_radius }),

  loadSettings: (settings) => set(settings),
}));
