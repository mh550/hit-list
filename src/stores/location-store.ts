import { create } from 'zustand';
import type { GeoPoint } from '@/src/types';

interface LocationState {
  currentLocation: GeoPoint | null;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  setCurrentLocation: (location: GeoPoint | null) => void;
  setPermissionStatus: (status: 'undetermined' | 'granted' | 'denied') => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  currentLocation: null,
  permissionStatus: 'undetermined',

  setCurrentLocation: (location) => set({ currentLocation: location }),
  setPermissionStatus: (status) => set({ permissionStatus: status }),
}));
