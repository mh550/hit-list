import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  Accuracy,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
  type LocationObject,
} from 'expo-location';

import { useLocationStore } from '@/src/stores/location-store';

const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

const toPoint = ({ coords }: LocationObject) => ({ latitude: coords.latitude, longitude: coords.longitude });

/**
 * Keeps the location store current for the Spots tab: asks for foreground permission once, then on
 * mount and every time the app returns to the foreground sets a recent last-known position (fast)
 * followed by a fresh fix. Denied or failing requests leave the store as it is, so distances stay
 * blank (or keep the last good value) rather than going wrong.
 */
export function useCurrentLocation(): void {
  const setCurrentLocation = useLocationStore((s) => s.setCurrentLocation);
  const setPermissionStatus = useLocationStore((s) => s.setPermissionStatus);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const { granted } = await requestForegroundPermissionsAsync(); // prompts only the first time
        if (!active) return;
        setPermissionStatus(granted ? 'granted' : 'denied');
        if (!granted) return;
        const last = await getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
        if (active && last) setCurrentLocation(toPoint(last));
        const fresh = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
        if (active) setCurrentLocation(toPoint(fresh));
      } catch {
        // No fix (airplane mode, indoors, timeout): keep whatever position we already have.
      }
    };

    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [setCurrentLocation, setPermissionStatus]);
}
