import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  Accuracy,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
} from 'expo-location';

import { useLocationStore } from '@/src/stores/location-store';
import { toGeoPoint } from '@/src/utils/geo';

const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

/**
 * Keeps the location store current for the Spots tab: asks for foreground permission once, then on
 * mount and whenever the app comes back from the background sets a recent last-known position
 * (fast) followed by a fresh fix. Denied or failing requests leave the store as it is.
 */
export function useCurrentLocation(): void {
  useEffect(() => {
    const { setCurrentLocation, setPermissionStatus } = useLocationStore.getState();
    let running = false;

    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const { granted } = await requestForegroundPermissionsAsync(); // prompts only the first time
        setPermissionStatus(granted ? 'granted' : 'denied');
        if (!granted) return;
        const last = await getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
        if (last) setCurrentLocation(toGeoPoint(last));
        setCurrentLocation(toGeoPoint(await getCurrentPositionAsync({ accuracy: Accuracy.Balanced })));
      } catch {
        // No fix (airplane mode, indoors, timeout): keep whatever position we already have.
      } finally {
        running = false;
      }
    };

    void refresh();
    // Only a real return from the background; Control Center or Face ID sheets go inactive → active.
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      if (previous === 'background' && state === 'active') void refresh();
      previous = state;
    });
    return () => subscription.remove();
  }, []);
}
