import { useEffect } from 'react';
import {
  Accuracy,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
  type LocationObject,
} from 'expo-location';

import { useLocationStore } from '@/src/stores/location-store';

const toPoint = ({ coords }: LocationObject) => ({ latitude: coords.latitude, longitude: coords.longitude });

/**
 * Asks for foreground location once per mount and fills the location store: the last known
 * position straight away (fast), then a fresh fix. Denied or failing requests leave the store
 * without a location, so distances simply stay blank.
 */
export function useCurrentLocation(): void {
  const setCurrentLocation = useLocationStore((s) => s.setCurrentLocation);
  const setPermissionStatus = useLocationStore((s) => s.setPermissionStatus);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { granted } = await requestForegroundPermissionsAsync();
        if (!active) return;
        setPermissionStatus(granted ? 'granted' : 'denied');
        if (!granted) return;
        const last = await getLastKnownPositionAsync();
        if (active && last) setCurrentLocation(toPoint(last));
        const fresh = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
        if (active) setCurrentLocation(toPoint(fresh));
      } catch {
        // No fix (airplane mode, simulator, timeout): keep whatever position we already have.
      }
    })();
    return () => {
      active = false;
    };
  }, [setCurrentLocation, setPermissionStatus]);
}
